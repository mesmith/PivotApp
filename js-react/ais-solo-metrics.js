// mongodb app to load CSV data
//
/* eslint-disable no-console */
//
import constants from './constants';
import time from './time';
import reader from './reader';
import utils from './utils';
import metadata from './metadata';
import fs from 'fs';
import csv from 'csvtojson';
import { MongoClient } from 'mongodb';

const ais_solo_metrics = function(){
  const connectString = 'mongodb://localhost:27017/pivotDb';

  const entityKey = 'ID';
  const entityFields = [ 'ID', 'Name' ];

  const cambridgeFields = {
    vintage: { column: 'Vintage Year', type: 'number' },
    // avgIRR: { column: 'Arithmetic Mean (%)', type: 'percent' },
    medianIRR: { column: 'Median (%)', type: 'percent' },
    upperQuartileIRR: { column: 'Upper Quartile (%)', type: 'percent' },
    lowerQuartileIRR: { column: 'Lower Quartile (%)', type: 'percent' },
    dpi: { column: 'DPI', type: 'percent' },
    rvpi: { column: 'RVPI', type: 'percent' },
    // tvpi: { column: 'TVPI', type: 'percent '},
  };
  const preqinFields = {
    vintage: { column: 'Vintage', type: 'number' },
    medianIRR: { column: 'IRR Quartiles (%) Median', type: 'percent' },
    upperQuartileIRR: { column: 'IRR Quartiles (%) Q1', type: 'percent' },
    lowerQuartileIRR: { column: 'IRR Quartiles (%) Q3', type: 'percent' },
    dpi: { column: 'Median Fund Dist (%) DPI', type: 'percent' },
    rvpi: { column: 'Median Fund Value (%) RVPI', type: 'percent' },
    // tvpi: { column: 'TVPI' type: 'percent' },
  };
  const spyFields = {
    vintage: { column: 'vintage', type: 'date' },
    price: { column: 'price', type: 'number' },
    yield: { column: 'yield', type: 'percent' },
    medianIRR: { column: 'medianIRR', type: 'number' },
  };
  const rawSPYpriceFields = {
    vintage: {column: 'Date', type: 'date'},
    price: {column: 'Value', type: 'number'}
  };
  const rawSPYyieldFields = {
    vintage: {column: 'Date', type: 'date'},
    yield: {column: 'Value', type: 'percent'}
  };

  const entityFieldMap = entityFields.reduce((j, k) => {
    return {...j, ...{[k]: true}};
  }, {});

  const isDateField = function(i) {
    return !entityFieldMap.hasOwnProperty(i);
  }

  const execute = function() {
    const datasets = [
      'AIS_Flows',
      'AIS_Entities', 
      'Preqin_VC_Global_31Dec2018',
      'Preqin_PE_Global_31Dec2018',
      'Cambridge_PE_IRR_31Mar2018',
      'Cambridge_VC_IRR_31Dec2017',
      'SPY-prices',  // from quandl.com
      'SPY-yields',  // from quandl.com
    ];
    readOneMongo('AIS_Nav_Events').then(navEventData => {
      readManyCSV(datasets).then(results => {
        const flowData = results[0];
        const entityData = results[1];
        const preqinPE = results[2];
        const preqinVC = results[3];
        const cambridgePE = results[4];
        const cambridgeVC = results[5];
        const spyPrices = results[6];
        const spyYields = results[7];

        // The S&P 500 data has to be merged; then we have to calculate
        // IRRs for it
        //
        const spyData = mergePriceAndYield(spyPrices, spyYields);
        const spyWithIRR = addIRRtoSPY(spyData, spyFields);

        const entityMap = utils.getEntityMap(entityData, entityKey);
        const spyMap = toMonthly(getVintageMap(spyData, spyFields));
        const metricData = getMetricData(flowData, entityMap, navEventData, spyMap);

        const cambridgePEvintageMap = getVintageMap(cambridgePE, cambridgeFields);
        const cambridgeVCvintageMap = getVintageMap(cambridgeVC, cambridgeFields);
        const preqinPEvintageMap = getVintageMap(preqinPE, preqinFields);
        const preqinVCvintageMap = getVintageMap(preqinVC, preqinFields);
        const spyVintageMap = getVintageMap(spyWithIRR, spyFields);

        // For Cambridge and Preqin, the data have yearly granularity;
        // for S&P 500, we have monthly data
        //
        const withCambridgePE = addBenchmarks(metricData, cambridgePEvintageMap,
            'CambridgePE', cambridgeFields, 'year');
        const withCambridgeVC = addBenchmarks(withCambridgePE, cambridgeVCvintageMap,
            'CambridgeVC', cambridgeFields, 'year');
        const withPreqinPE = addBenchmarks(withCambridgeVC, preqinPEvintageMap,
            'PreqinPE', preqinFields, 'year');
        const withPreqinVC = addBenchmarks(withPreqinPE, preqinVCvintageMap,
            'PreqinVC', preqinFields, 'year');
        const withSpy = addBenchmarks(withPreqinVC, spyVintageMap, 'SP500', spyFields,
            'month');

        connectAndLoad(connectString, 'AIS_solo_metrics', withSpy);
      });
    });
  }

  // Enhance 'flowData' so that it contains, on each row:
  // - cumulative capital calls
  // - cumulative distributions
  // - most recent NAV
  // - IRR, RVPI, DPI, TVPI, and PIC
  // - Inception date (first cash flow date)
  // - The price of the S&P 500 at the time of the event
  //   (NOTE that we are currently only storing the end-of-month price!)
  //
  const getMetricData = function(flowData, entityMap, navEventData, spyMap) {
    const quarterlyNavs = getQuarterlyNavs(navEventData);

    // Divide data by entity; create a time-series for each record called xFlows;
    // and persist constant data (e.g. name, commitment),
    // data accumulated for the entity (PIC, distibutions),
    // or data based on very last data record (e.g. NAV).
    //
    const byEntity = flowData.filter(i => {
      return i.Calls !== '' || i.Distributions !== '' ||
          i['Other Outflow'] !== '' || i['Other Inflow'] !== '';
    }).reduce((i, j) => {
      const id = j.Entity;
      const prevSeries = i.hasOwnProperty(id) ? i[id] : [];

      const xNav = getNavByDate(j.Entity, j.Date, quarterlyNavs);
      const rawCall = getFlowNumber(j.Calls);
      const call = rawCall === 0 ? 0 : rawCall * -1;  // testing for 0: we don't want -0 result

      // Note that we don't yet count otherOutflow (or otherInflow), because
      // it is not yet clear whether these are just notations, or are distinct
      // monies being exchanged.  
      //
      // By inspection we note that the difference is about $4M
      // in total cash flow.
      //
      const rawOutflow = getFlowNumber(j['Other Outflow']);

      // testing for 0: we don't want -0 result
      //
      const otherOutflow = rawOutflow === 0 ? 0 : rawOutflow * -1;

      // const xCall = call + otherOutflow;
      const xCall = call;

      const distribution = getFlowNumber(j.Distributions);
      const otherInflow = getFlowNumber(j['Other Inflow']);
      // const xDistribution = distribution + otherInflow;
      const xDistribution = distribution;

      const thisRec = {...j, xNav, xCall, xDistribution};

      const obj = {[id]: prevSeries.concat([thisRec])};

      return {...i, ...obj};
    }, {});

    // Get the very latest Last Nav Date and event date.  We'll calculate the NAV for every
    // entity up to this date, so that the NAV plot doesn't appear to
    // artifically shrink to nothing in the last couple of months because
    // of underreporting the NAVs for some entities.
    //
    const maxLastNavDate = Object.keys(byEntity).reduce((i, j) => {
      const xFlows = byEntity[j];
      const lastFlow = xFlows[xFlows.length-1];

      const lastFlowDateString = lastFlow.Date;
      const lastFlowDateSecs = (new Date(lastFlowDateString))/1000;

      const lastNavDateString = getEntityAttr(j, entityMap, 'Las NAV Date', null);
      const lastNavDateSecs = lastNavDateString ? (new Date(lastNavDateString))/1000 : 0;

      const prevNavDateSecs = (new Date(i))/1000;

      const latest = [
        {secs: lastFlowDateSecs, out: lastFlowDateString},
        {secs: lastNavDateSecs, out: lastNavDateString},
        {secs: prevNavDateSecs, out: i},
      ].sort((k, l) => {
        return l.secs - k.secs;
      })[0].out;

      return latest;
    }, '01/01/1970');

    const pass1 = Object.keys(byEntity).map(i => {
      const xName = getEntityName(i, entityMap);

      // This guarantees that there is an entry for every month of the existence
      // of the entity.
      //
      const xLastNavDate = getEntityAttr(i, entityMap, 'Las NAV Date');
      const xCommitment = getEntityCommitment(i, entityMap);
      const xCommitmentBin = getCommitmentBin(xCommitment);
      const xInvestmentType = getEntityAttr(i, entityMap, 'Investment Type', '(None)');
      const xStatus = getEntityAttr(i, entityMap, 'Status', '(None)');
      const xPhase = getEntityAttr(i, entityMap, 'Phase', '(None)');
      const xBenchmark1 = getEntityAttr(i, entityMap, 'Benchmark 1', '(None)');

      // For closed funds, 'xLastNavDate' is the last NAV date; for open funds,
      // it's always maxLastNavaAte.
      //
      const lastNavDate = xStatus === 'Active' ? maxLastNavDate : xLastNavDate;

      const xFlows = fillFlowData(byEntity[i], quarterlyNavs, lastNavDate);
      const xNav = xFlows[xFlows.length - 1].xNav || 0;

      // Last NAV value from the Entity table conflict check.  If any of these
      // values appear, it probably means that the Last NAV from the Entity table
      // was corrected in the badEntityNAVs table in ais-nav-load.js.
      //
      // Remove the false check to look for bad NAVs from entity table.
      //
      if (false) {
        const xNavEntity = getEntityAttrFloat(i, entityMap, 'Last NAV');
        if (xNavEntity != xNav) {
          console.log('NAV conflict for xName=' + xName + ', id=' + i +
              ', entity nav=' + xNavEntity + ', cash flow nav=' + xNav);
        }
      }
      const xEntityIRR = utils.getXIRRfromFlow(xFlows, 'xCall', 'xDistribution', 'Date');
      const xPIC = xFlows.reduce((j, k) => {
        return j + k.xCall;
      }, 0);
      const xCumDistribution = xFlows.reduce((j, k) => {
        return j + k.xDistribution;
      }, 0);
      return {Entity: i, xName, xCommitment, xCommitmentBin,
          xInvestmentType, xStatus, xPhase, xBenchmark1,
          xLastNavDate, xNav, xPIC, xCumDistribution, xEntityIRR, xFlows};
    });

    const pass2 = addBenchmarkPricesAndYields(pass1, spyMap, spyFields,
        'xSPYprice', 'xSPYshares', 'xSPYyield', 'xSPYdividend');
    const pass3 = addDecile(pass2, 'xEntityIRR', 'xEntityIRRDecile');
    const pass4 = addDecile(pass3, 'xCommitment', 'xEntityCommitmentDecile');
    const pass5 = addDecile(pass4, 'xCumDistribution', 'xEntityDistributionDecile');
    
    return pass5;
  }

  // This will "fill up" the flowData by adding a zero entry to every missing month.
  // This will allow us to track the net asset value, even if there are few
  // transactions for an entity.
  //
  // The months start with the initial investment (in flowData[0]),
  // and finish with the latest reported date for any of the entities
  // (or the reported last NAV date, for closed entities).
  //
  // Doing things this was will keep us from underreporting NAVs.  However,
  // it means that we're sometimes using NAVs that are projected into the
  // future from the entity's Last NAV after the entity's Last Nav Date.
  //
  const fillFlowData = function(flowData, quarterlyNavs, xLastNavDate) {
    const len = flowData.length;
    const withAllMonths = flowData.map((i, j) => {
      const thisMonth = getFirstOfMonth(i.Date);

      const nextDate = getNextDate(flowData, j, xLastNavDate);
      const nextMonth = nextDate ? getFirstOfMonth(nextDate) : null;

      const fillMonths = (thisMonth && nextMonth && thisMonth !== nextMonth) ? 
          fillFlowMonths(i, quarterlyNavs, thisMonth, nextMonth) : [];
      return [i].concat(fillMonths);
    });

    return [].concat.apply([], withAllMonths);
  }

  // Determine the next date for NAV calculations.  It's either the
  // next cash flow date (if there is one), or it's one month
  // after the xLastNavDate (assuming there is one, and that it's 
  // later than the current cash flow date).
  //
  // We return one month *after* the xLastNavDate so that the caller can
  // use it exactly like the cash flow event: we'll only fill in 
  // non-cash-flow events up to one month *prior* to the next cash flow event.
  //
  // xLastNavDate is a date string, not a Date.
  //
  const getNextDate = function(flowData, idx, xLastNavDate) {
    if ((idx+1) < flowData.length) {
      return flowData[idx+1].Date;
    }
    if (!xLastNavDate) return null;
    const thisDate = flowData[idx].Date;
    const lastNavDateOk = ((new Date(xLastNavDate))/1000 > (new Date(thisDate)/1000));
    const monthAfterLastNavDate = getNextMonthDateString(xLastNavDate);
    return lastNavDateOk ? monthAfterLastNavDate : null;
  }

  // Given two months of the form 'mm/01/yyyy', return an array of
  // zero cash flows including those two months and all in between.
  //
  // The Date fields in the result are of the form 'mm/01/yyyy'.
  //
  const fillFlowMonths = function(oneFlow, quarterlyNavs, monthStart, monthEnd) {
    const zeroes = {
      Calls: "",
      Distributions: "",
      "Other Outflow": "",
      "Other Inflow": "",
      xCall: 0,
      xDistribution: 0
    };

    return createMonths(monthStart, monthEnd).map(i => {
      const xNav = getNavByDate(oneFlow.Entity, i, quarterlyNavs);
      return {...oneFlow, 'Date': i, ...zeroes, xNav};
    });
  }

  // Return a vector of months with monthStart at the beginning and
  // monthEnd at the end. 
  //
  // The input date strings are of the form 'mm/01/yyyy'.
  //
  // The result is a list of date strings of the form mm/01/yyyy.
  //
  const createMonths = function(monthStart, monthEnd) {
    const firstMonthDate = getNextMonth(new Date(monthStart));
    const lastMonthDate = getPrevMonth(new Date(monthEnd));

    var months = [];
    for (var d = firstMonthDate; d/1000 <= lastMonthDate/1000; d = getNextMonth(d)) {
      const dateString = getDateString(d);
      months.push(dateString);
    }
    return months;
  }

  // Given a date string, return a date string representing the next month.
  //
  // The returned value will be for the first of next month.
  //
  const getNextMonthDateString = function(dateString) {
    const firstOfMonth = getFirstOfMonth(dateString);
    return dateString ? getDateString(getNextMonth(new Date(firstOfMonth))) : null;
  }

  // Given a date string of the form 'mm/dd/yyyy', return a date string of
  // the form 'mm/01/yyyy'.
  //
  const getFirstOfMonth = function(dateString) {
    const splitter = dateString.split('/');
    return splitter[0] + '/01/' + splitter[2];
  }

  // Given a Date object 'date', return a Date representing one month later
  //
  const getNextMonth = function(date) {
    const nextMonthDate = new Date(date);
    nextMonthDate.setMonth(date.getMonth() + 1);
    return nextMonthDate;
  }

  const getPrevMonth = function(date) {
    const nextMonthDate = new Date(date);
    nextMonthDate.setMonth(date.getMonth() - 1);
    return nextMonthDate;
  }

  // Take a Date object and return its equivalent DateString,
  // of the form: mm/dd/yyyy.
  //
  const getDateString = function(date) {
    const month = date.getMonth() + 1;
    const mm = month < 10 ? `0${month}` : month;
    const yyyy = date.getFullYear();
    const day = date.getDate();
    const dd = day < 10 ? `0${day}` : day;
    return `${mm}/${dd}/${yyyy}`;
  }

  // Given data, add benchmark prices and yields from 'priceMap" to the cash flows.
  // In addition, add the number of shares that were purchasable for
  // that cash flow, using the call amount.
  //
  const addBenchmarkPricesAndYields = function(data, priceMap, priceFields,
      benchPriceField, benchShareField, benchYieldField, benchDividendField) {
    const priceField = priceFields.price.column;
    const yieldField = priceFields.yield.column;
    return data.map(i => {
      const initPrice = getInitBenchmarkPrice(i.xFlows, priceMap, priceField);

      const newFlows = i.xFlows.reduce((j, k) => {
        const monthDateString = flowDateToMonth(k.Date);
        const priceObj = priceMap.hasOwnProperty(monthDateString)
            ? priceMap[monthDateString]
            : {};
        const price = priceObj.hasOwnProperty(priceField) ? priceObj[priceField] : null;
        const call = k.xCall || 0;
        const calls = j.calls + call;
        const yieldVal = priceObj.hasOwnProperty(yieldField) ? priceObj[yieldField] : null;
        const shares = call && price ? call / price : 0;
        const firstEventInMonth = isFirstEventOfMonth(k.Date, j.date);

        // We only record a dividend once each month (on the first event
        // of that month).
        //
        const dividend = firstEventInMonth
          ? calls * price * yieldVal / initPrice
          : 0;

        const obj = {
          [benchPriceField]: price,
          [benchYieldField]: yieldVal,
          [benchShareField]: shares,
          [benchDividendField]: dividend
        };
        const flow = {...k, ...obj};
        const flows = j.flows.concat(flow);
        return {calls, flows, date: flow.Date};
      }, {calls: 0, flows: [], date: null});

      const xFlows = newFlows.flows;

      return {...i, xFlows};
    });
  }

  // Return the initial benchmark price for 'flows'
  //
  const getInitBenchmarkPrice = function(flows, priceMap, priceField) {
    const zeroFlow = flows.length > 0 ? flows[0] : null;
    if (zeroFlow) {
      const monthDateString = flowDateToMonth(zeroFlow.Date);
      const priceObj = priceMap.hasOwnProperty(monthDateString)
          ? priceMap[monthDateString]
          : {};
      return priceObj.hasOwnProperty(priceField) ? priceObj[priceField] : null;
    } else {
      return 0;
    }
  }

  // Add 'decileField' to 'data', using 'inputField' to calculate the
  // deciles.
  //
  const addDecile = function(data, inputField, decileField) {
    const len = data.length;
    const fractile = 0.1;
    return data.sort((i, j) => {
      return i[inputField] - j[inputField];
    }).map((i, j) => {
      const frac = j / len;
      const fracBin = Math.floor(frac / fractile) + 1;
      const formatted = metadata.applyFormat(fracBin, 'decile', null);
      return {...i, ...{[decileField]: formatted}};
    });
  }

  // Given a commitment, return a bin for it.  Allows for easy size filtering.
  //
  const getCommitmentBin = function(commitment) {
    if (commitment <= 500000) {
      return '$0 - $500K';
    } else if (commitment > 500000 && commitment <= 1000000) {
      return '$500K - $1M';
    } else {
      const millions = Math.floor(commitment/1000000);
      return '$' + millions + ' - $' + (millions+1) + 'M';
    }
  }

  // Given id, return name of entity, or 'id' if there is none.
  //
  const getEntityName = function(id, entityMap) {
    return entityMap.hasOwnProperty(id) ? entityMap[id].Name : id;
  }

  // Given id, return monetary commitment as a number, or null if none.
  //
  const getEntityCommitment = function(id, entityMap) {
    return getEntityAttrFloat(id, entityMap, 'Commitment');
  }

  const getEntityAttrFloat = function(id, entityMap, attr) {
    return entityMap.hasOwnProperty(id)
      ? (entityMap[id].hasOwnProperty(attr) ? utils.getFloat(entityMap[id][attr]) : null)
      : null;
  }

  const getEntityAttr = function(id, entityMap, attr, defaultValue) {
    const dValue = defaultValue || null;
    const value = entityMap.hasOwnProperty(id)
      ? (entityMap[id].hasOwnProperty(attr) ? entityMap[id][attr] : null)
      : null;

    return value || defaultValue;
  }

  // Convert 'num', of the form '(?COMMA-SEP-NUM)?', into numeric.
  //
  const getFlowNumber = function(num) {
    const rawNum = num !== ''
        ? parseFloat(num.replace(/,/g, '').replace(/\(/g, '').replace(/\)/g, ''))
        : 0;
    const res = (num && num[0]==='(') ? rawNum * -1 : rawNum;
    return res === 0 ? 0 : res;  // test for the weird -0 result
  }

  // Return the nav for 'date', or null if none found
  //
  const getNavByDate = function(entity, date, quarterlyNavs) {
    const quarter = utils.getQuarter(date);

    return quarterlyNavs.hasOwnProperty(entity) &&
        quarterlyNavs[entity].hasOwnProperty(quarter) ? quarterlyNavs[entity][quarter] : null;
  }

  const getYear = function(date) {
    const splitDate = date.split('/');
    return splitDate.length > 2 ? splitDate[2] : null;
  }

  // Return the month and year from 'date', where 'date' is of the form
  // mm/dd/yyyy, and the result is of the form yyyy-mm.
  //
  const getMonth = function(date) {
    const splitDate = date.split('/');
    const month =  splitDate.length > 2 ? splitDate[0] : null;
    const year = getYear(date);
    return `${year}-${month}`;
  }

  // Create a map that lets us look up a nav by (entity, quarter).
  //
  const getQuarterlyNavs = function(navEventData) {

    // First, group the data by ID, and sort it by date
    //
    const sortedAndGrouped = navEventData.sort((i, j) => {
      const d1 = new Date(i.date)/1000;
      const d2 = new Date(j.date)/1000;
      return d1 - d2;
    }).reduce((i, j) => {
      const id = j.ID;
      const prev = i.hasOwnProperty(id) ? i[id]: null;
      const cur = Array.isArray(prev) ? prev.concat([j]) : [j];
      const obj = {[id]: cur};

      return {...i, ...obj};
    }, {});

    // Now index the nav data by quarter, since that's the fidelity of the data
    //
    return Object.keys(sortedAndGrouped).reduce((i, j) => {
      const recsById = sortedAndGrouped[j];
      const byQuarter = recsById.reduce((k, l) => {
        const splitDate = l.date.split('/');
        const quarter = splitDate[0] + '/' + splitDate[2];
        const obj = {[quarter]: l.nav};

        return {...k, ...obj};
      }, {});

      return {...i, ...{[j]: byQuarter}};
    }, {});
  }

  // Given a vintage map of the form { YYYY-MM-DD: value, ...}
  //   return a vintage map of the form { YYYY-MM: value }.
  // The latter format is useful when the dates are known to
  // have monthly granularity.
  //
  const toMonthly = function(vintageMap) {
    return Object.keys(vintageMap).reduce((i, j) => {
      const monthDateString = benchmarkDateToMonth(j);
      return {...i, ...{[monthDateString]: vintageMap[j]}};
    }, {});
  }

  // Return a map from vintage year to benchmark data for a 
  // benchmark dataset.
  //
  // 'fields' is how we determine the fields of interest.
  //
  // 'fields' must have a 'vintage' entry.
  //
  // Apply the type to the returned values.  Percentage values are converted
  // to decimals.
  //
  const getVintageMap = function(data, fields) {
    return data.reduce((i, j) => {
      const object = Object.keys(fields).reduce((k, l) => {
        const column = fields[l].column;
        const type = fields[l].type;
        const value = j.hasOwnProperty(column) ? j[column] : null;
        const convertedValue = isNumber(value) && type === 'percent'
          ? value/100
          : value;
        return {...k, ...{[l]: (isNumber(convertedValue) ? +convertedValue : value)}};
      }, {});

      return {...i, ...{[object.vintage]: object}};
    }, {});
  }

  // Given an array of S&P 500 (or perhaps other equity) monthly benchmark data,
  // add in calculations for IRR for each month.
  //
  // Monthly yields are in yearly percentages.
  //
  // Dates input is of the form 'yyyy-mm-dd', but need to be converted
  // to monthly on output to be comparable to cash flows,
  // so the output format is 'yyyy-mm'.
  //
  const addIRRtoSPY = function(data, fields) {

    // O(n**2), since each IRR calculation is linear, and we do one
    // for every record from 'data'.
    //
    return data.map((i, j) => {
      const medianIRR = getEquityIRR(data.slice(j), fields);
      const vintage = benchmarkDateToMonth(i.vintage);
      return {...i, vintage, medianIRR};
    });
  }

  // Merge the priceData with the yieldData.
  //
  const mergePriceAndYield = function(priceData, yieldData) {
    const dates = priceData.map(i => i.Date); // 
    const priceMap = getVintageMap(priceData, rawSPYpriceFields);
    const yieldMap = getVintageMap(yieldData, rawSPYyieldFields);
    return mergeValues(dates, priceMap, yieldMap);
  }

  // Merge the two maps into a single map.  'keys' is an ordered list
  // of the keys to both maps.  The result is sorted by vintage.
  //
  const mergeValues = function(keys, map1, map2) {
    return keys.map(i => {
      const m1 = map1.hasOwnProperty(i) ? map1[i] : {};
      const m2 = map2.hasOwnProperty(i) ? map2[i] : {};
      return {...m1, ...m2};
    }).sort((i, j) => {
      const d1 = i.vintage;
      const d2 = j.vintage;
      return new Date(d1) - new Date(d2);
    });
  }

  // Given a date of the form 'yyyy-mm-dd', return the date of the
  // form 'yyyy-mm'.  Note that the result format is a valid input to new Date().
  //
  const benchmarkDateToMonth = function(d) {
    const dArr = d.split('-');
    const year = dArr.length === 3 ? dArr[0] : null;
    const month = dArr.length === 3 ? dArr[1] : null;
    return `${year}-${month}`;
  }

  // Same output as the above, but the input is of the form mm/dd/yyyy,
  // as we see in cash flow objects.
  //
  const flowDateToMonth = function(d) {
    const dArr = d.split('/');
    const year = dArr.length === 3 ? dArr[2] : null;
    const month = dArr.length === 3 ? dArr[0] : null;
    return `${year}-${month}`;
  }

  // Given that input is of the form mm/dd/yyyy, return true if the
  // date represents the first flow event of the month.
  //
  // It's the first flow event if the date of the previous flow
  // event is not in the same month.
  //
  // Return false if there is no previous month (in other words,
  // d represents the very first flow event).  We do this because
  // we use this routine to determine whether to pay a dividend,
  // and we assume that there is no dividend in the first month.
  //
  const isFirstEventOfMonth = function(d, prevDate) {
    const dArr = d ? d.split('/') : [];
    const month = dArr.length === 3 ? dArr[0] : null;
    const prevArr = prevDate ? prevDate.split('/') : [];
    const prevMonth = prevArr.length === 3 ? prevArr[0] : null;
    return prevMonth && month !== prevMonth;
  }

  // Return IRR for a single vector of equity data (date, price, yield).
  //
  // The yields in 'data' are yearly, and in decimal (not percentage),
  // but the price data is monthly,
  // so we divide the yield by 12 to get a monthly distribution.
  //
  const getEquityIRR = function(data, fields) {
    const vintageField = fields.vintage.column;
    const priceField = fields.price.column;
    const yieldField = fields.yield.column;

    const initPrice = data.length > 0 ? data[0][priceField] : 0;

    const values = initPrice ? data.map((i, j) => {
      const currentPrice = i.hasOwnProperty(priceField) ? i[priceField] : 0;
      const currentYield = i.hasOwnProperty(yieldField) ? i[yieldField] : 0;
      const distribution = (currentPrice * (currentYield/12)) / initPrice;

      if (j === 0) {                      // Buy month.  1 share.
        return -1;
      } else if (j === data.length - 1) { // Sell month (assume sold end of month)
        return distribution + (currentPrice / initPrice);
      } else {                            // Dividend month
        return distribution;
      }
    }) : [];
    const dates = initPrice ? data.map(i => {
      const date = i.hasOwnProperty(vintageField) ? i[vintageField] : null;
      return new Date(date);
    }) : [];

    // Normalizing S&P values to 1 "share" appears to cause the IRR
    // bisection algorithm to diverge.  So we multiply values by 100.
    // It works.  I don't know why; possibly because the present value
    // exponential blows up.
    //
    const bigValues = values.map(i => i*100);

    return values.length > 1 ? utils.getXIRR(bigValues, dates, -0.5) : 0;
  }

  // Given a benchmark 'vintageMap' for the 'benchmarkName', return the dataset
  // with the benchmark data added in.
  //
  // We add the benchmark in as a field whose value is a vector of benchmark
  // data.  This allows the aggregation pipeline to aggregate the vector, and
  // we can then use a calculated field to pull out the data from the vector
  // that we need.
  //
  // In the case of benchmarks, we'll always be looking for the benchmark data
  // with the earliest vintage: that's the benchmark that contains the IRR
  // that is the most useful comparison.
  //
  // 'frequency' may be 'year' (if the benchmark data has yearly granularity)
  // or 'month' (if monthly).
  //
  const addBenchmarks = function(data, vintageMap, benchmarkName, benchmarkFields,
      frequency) {
    return data.map(i => {
      const vintage = getVintage(i, frequency);
      const benchmarkData = vintageMap.hasOwnProperty(vintage) ? vintageMap[vintage] : {};
      const benchmarkObject = Object.keys(benchmarkFields).reduce((j, k) => {
        const value = benchmarkData.hasOwnProperty(k) ? benchmarkData[k] : null;
        return {...j, ...{[k] : value}};
      }, {});

      return {...i, ...{[benchmarkName]: benchmarkObject}};
    });
  }

  // Given a row of entity data, return the entity's vintage.
  // Return null if not found
  //
  const getVintage = function(row, frequency) {
    const flow0 = Array.isArray(row.xFlows) && row.xFlows.length > 0 ? row.xFlows[0] : null;
    const fn = frequency === 'year' ? getYear : getMonth;
    return flow0 ? fn(flow0.Date) : null;
  }

  const isNumber = function(n) {
    return !isNaN(n) && isFinite(n);
  }

  // Return all rows of mongodb 'collection' as a promise.
  //
  const readOneMongo = function(collection) {
    return reader.connect(connectString).then(db => {
      return reader.getData(db, collection);
    });
  }

  const readManyCSV = function(array) {
    const promises = array.map(function(i){
      return readOne(i);
    });
    return Promise.all(promises);
  }

  const readOne = function(dataset){
    const location = '../data/' + dataset + '.csv';

    // FIXME
    const numerics = [];

    // Make sure that csvtojson doesn't convert numbers to strings
    //
    const colParser = numerics.reduce((i, j) => {
      return {...i, ...{[j]: 'number'}};
    }, {});

    return csv({colParser}).fromFile(location).then((rawData) => {
      console.log('Reading ' + dataset + '.  input #rec=' + rawData.length);

      return rawData;
    });
  }

  // This will connect to the mongodb listener, and then will
  // load 'dataset' with 'data'
  //
  const connectAndLoad = function(connectString, dataset, data) {
    MongoClient.connect(connectString).then(function(db){

      // Get list of existing collections prior to loading
      //
      db.collections().then(function(collections) {
        const collectionMap = collections.reduce((i, j) => {
          return {...i, ...{[j.collectionName]: true}};
        }, {});

        // Remove the entire collection
        //
        if (collectionMap.hasOwnProperty(dataset)) {
          db.collection(dataset).drop();
        }

        const collection = db.collection(dataset);

        console.log('Loading ' + dataset + '.  output #rec=' + data.length);
        if (data.length > 0) {
          collection.insertMany(data).then(result => {
            console.log('Loaded ' + dataset);
            process.exit(0);
          });
        } else {
          console.log('There were no records to load');
          process.exit(0);
        }
      });
    })
    .catch(function(err){
      return console.dir(err);
    });
  }

  return {
    execute
  }
}();

ais_solo_metrics.execute();
