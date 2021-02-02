import fedHolidays from '@18f/us-federal-holidays';
import moment from 'moment';
import constants from './constants';

// Utility functions
//
const utils = function(){

  const maxTextLength = 16;

  // List of risk free rates of return since 2011.
  // Values are in percentages
  //
  const riskFreeRates = {
    2019: 2.71,
    2018: 2.58,
    2017: 2.43,
    2016: 2.09,
    2015: 1.88,
    2014: 2.86,
    2013: 1.91,
    2012: 1.97,
    2011: 3.39,
    2010: 3.73,
    2009: 2.52,
    2008: 3.74,
    2007: 4.76,
    2006: 4.42,
    2005: 4.22,
    2004: 4.15,
    2003: 4.05,
    2002: 5.04,
    2001: 5.16,
    2000: 6.66,
  };

  // Return numeric form of obj[attr] if 'attr' is defined.  If not, return 0
  //
  function safeVal(obj, attr) {
    if (obj.hasOwnProperty(attr)) {
      const val = obj[attr];
      return isNumeric(val) ? +val : (validDate(val) ? new Date(val) : 0);
    } else {
      return 0;
    }
  }

  function isNumeric(val) {
    return !isNaN(val) && isFinite(val);
  }

  function validDate(val) {
    return isDate(new Date(val));
  }

  function isDate(dt) {
    return dt instanceof Date && !isNaN(dt);
  }

  // Apply reducing function 'func' to the result of accessing 'array'
  // through the 'accessor' function (which presumably gets some
  // value from each array instance object).
  // Return a safe numeric value, or 0 if there was a problem.
  //
  function getSafe(func, array, accessor){
    return ( array.length==0 ) ? 0 : +func(array, accessor);
  }

  // Given an array, return an array with a minimum range of values.
  //
  // For the max value, we always add a minBuffer factor to account for
  // large bubbles.
  //
  function getMinRange(arr){
    const { minBuffer, minRange } = constants.d3buffer;
    const diff = arr[1] - arr[0];
    const newMax = arr[1] + diff*(minBuffer - 1);
    return ( (newMax - arr[0])<minRange ) ? [arr[0], arr[0]+minRange]: [arr[0], newMax];
  }

  // Given raw dataset and a list of columns, return an object
  // whereby each column's unique values are enumerated.
  //
  function getAllUniqueValues(data, columns){
    if (!Array.isArray(data)) {
      return null;
    }
    return columns.reduce(function(v1, v2){
      return {...v1, ...{[v2]: getUniqueValues(data, v2)}};
    }, {});
  }

  // This function returns the unique values of 'column'
  // within the dataset 'data'.
  //
  function getUniqueValues(data, column){
    return data.map(function(x){
      return x[column];
    }).filter(function(value, index, self){
      return self.indexOf(value)===index;
    });
  }

  // Given an array, return an object with each element set to 'true'
  //
  const getMap = function(array){
    return array.reduce(function(a, b){
      return {...a, ...{[b]: true}};
    }, {});
  }

  // Case-insensitive sort using 'attr' of each object 's', 't'
  //
  const sorterWithAttr = function(attr, s, t){
    if( !s.hasOwnProperty(attr) || !t.hasOwnProperty(attr) ) return 0;
    const a = s[attr].toLowerCase();
    const b = t[attr].toLowerCase();
    if( a<b ) return -1;
    if( a>b ) return 1;
    return 0;
  }

  const alphaSort = function(attr, indexAttr, a, b){
    const reA = /[^a-zA-Z]/g;
    const aVal = a.hasOwnProperty(attr) ? a[attr] : null;
    const aIndex = a.hasOwnProperty(indexAttr) ? a[indexAttr] : null;
    const bVal = b.hasOwnProperty(attr) ? b[attr] : null;
    const bIndex = b.hasOwnProperty(indexAttr) ? b[indexAttr] : null;

    const aA = aVal.replace(reA, "");
    const bA = bVal.replace(reA, "");
    if (aA === bA) {
      return aIndex > bIndex ? 1 : -1;
    } else {
      return aA > bA ? 1 : -1;
    }
  }

  // Factory function returning function that sorts on attr, s, t
  //
  const sorter = function(attr){
    return function(s, t){ return sorterWithAttr(attr, s, t); }
  }

  // Returns a list of all nodes under the root.
  //
  const flatten = function(root) {
    var nodes = [], i = 0;
  
    function recurse(node) {
      if (node.children) node.children.forEach(recurse);
      if (node.id==null) node.id = ++i;
      nodes.push(node);
    }
  
    root.forEach(function(v, i){
      recurse(root[i]);
    })
    return nodes;
  }

  function truncate(str){
    if( str==null ) return str;
    if( str.length > maxTextLength ){
      return str.substr(0, maxTextLength - 2) + '...';
    } else {
      return str;
    }
  }

  // Given a vector of holidays for a year, return a map whose keys
  // are of the form 'month/day/year'.
  //
  function getHolidayMap(hol) {
    return hol.reduce((i, j) => {
      const parsed = j.dateString.split('-');
      const formattedDay = `${parsed[1]}/${parsed[2]}/${parsed[0]}`;

      return {...i, ...{[formattedDay]: true}};
    }, {});
  }

  function getDaysInMonth(iMonth, iYear) {
    return 32 - new Date(iYear, iMonth, 32).getDate();
  }

  function isWeekday(year, month, day, holidayMap) {
    const dayFromDate = new Date(year, month, day).getDay();
    const formattedDay = `${month}/${day}/${year}`;

    return dayFromDate!=0 && dayFromDate!=6 && 
        !holidayMap.hasOwnProperty(formattedDay);
  }

  // Return the number of working days in a particular month, year
  //
  function getWorkdaysInMonth(month, year) {
    const holidayOptions = {
      shiftSaturdayHolidays: true, shiftSundayHolidays: true
    };
    const hol = fedHolidays.allForYear(year, holidayOptions);
    const holidayMap = getHolidayMap(hol);

    const days = getDaysInMonth(month, year);
    var weekdays = 0;

    for(var i=0; i< days; i++) {
      if (isWeekday(year, month, i+1, holidayMap)) weekdays++;
    }
    return weekdays;
  }

  // Given a vector of cash flows (one flow per entity),
  // return the aggregate IRR.
  //
  // If the datapoint is itself an entity, then 'flows' will have
  // exactly one set of flows.
  //
  function getXIRRfromGroup(rec, flowField, callField, distributionField,
      dateField, entityField) {
    const allFlows = getAllFlows(rec, flowField, dateField);

    return getXIRRfromFlow(allFlows, callField, distributionField, dateField);
  }

  // Given a single cash flow, return the IRR.
  //
  // Note that we use the string form of dateField here, rather than the
  // version calculated by getAllFlows().  That's because there may be
  // other callers than just getXIRRfromGroup() above.
  //
  function getXIRRfromFlow(flows, callField, distributionField, dateField) {
    // The cash flow values: negative for calls, positive for distributions.
    //
    const values = flows.map(i => {
      const distribution = getValue(i, distributionField, 0);
      const call = getValue(i, callField, 0);
      return distribution - call;
    });

    const dates = flows.map(i => { return new Date(i[dateField]) });
    const dataOK = getOkForIRR(values);

    const sumForGuess = dataOK ? values.slice(1).reduce((i, j) => {
      return i + j;
    }, 0) : 0;

    // An initial guess less than -1 will force a complex number solution,
    // so don't go there.
    //
    const origGuess = -(sumForGuess / values[0]);
    const guess = origGuess <= -1 ? -0.9 : origGuess;

    return dataOK ? getXIRR(values, dates, guess) : 0;
  }

  // Return true if IRR can be calculated for 'flows'.
  //
  const getOkForIRR = function(flows) {
    return flows.reduce((i, j) => {
      const nPos = j > 0 ? i.nPos + 1 : i.nPos;
      const nNeg = j < 0 ? i.nNeg + 1 : i.nNeg;
      const res = nNeg > 0 && nPos > 0;

      return {res, nPos, nNeg};
    }, {res: false, nPos: 0, nNeg: 0}).res;
  }

  // Return XIRR (that is, IRR with irregular cash flows).
  //
  function getXIRR(values, dates, guess) {
    // Credits: algorithm inspired by Apache OpenOffice
    //

    // Return error if values does not contain at least one positive value 
    // and one negative value
    //
    const hasValues = values.reduce((i, j) => {
      const positive = i.positive || j > 0;
      const negative = i.negative || j < 0;
      return {positive, negative};
    }, {positive: false, negative: false});

    if (!hasValues.positive || !hasValues.negative) return '#NUM!';

    // Initialize guess
    //
    const realGuess = (typeof guess === 'undefined') ? 0.1 : guess;

    // Get the difference in days between all dates and the start date
    //
    const yearDiffs = getYearDiffs(dates);

    // Use discounted values for all capital calls.  Not doing this will cause
    // IRR to be completely useless.
    //
    // The result has values and dates in the single structure.
    //
    const allDiscounted = getDiscountedValues(values, dates, yearDiffs);
    const discountedValues = allDiscounted.map(i => i.value);
    const discountedDates = allDiscounted.map(i => i.date);

    // First, see if we can solve the cash flow rate directly (we can do this
    // if there are only two values).  If not, use bisection algorithm, which
    // is a bit stabler than the Newton method.
    //
    // Note: Testing has shown us that if the approximations blow up, it's because
    // the rate is vanishingly close to -100% (-1).
    //
    const minRate = -0.9999999999999999;
    const maxRate = 100;
    const maxIter = 100;
    const resultRate = (discountedValues.length === 2 )
      ? getRateForTwoValues(discountedValues, discountedDates)
      : null;

    return resultRate || getBisection(discountedValues, discountedDates,
          minRate, maxRate, realGuess, /* eps */ 0.1, maxIter);
  }

  // Given a set of values and their dates, return a new set of values that
  // discounts all of the capital calls and adds them to the first value.
  //
  const getDiscountedValues = function(values, dates, yearDiffs) {
    if (values.length !== dates.length) {
      return null;
    }
    const dateStart = dates[0];
    const year = dateStart.getFullYear();
    const discountRate = getRiskFreeRate(year);

    return values.map((i, j) => {
      const date = dates[j];
      const yearDiff = yearDiffs[j];

      if (i >= 0) {
        return {value: i, date};
      }

      // Use the discount rate in the year of the first capital call;
      // if we didn't find it, just don't discount the value.
      //
      const discounted = discountRate !== null
        ? getDiscountValue(-i, yearDiff, discountRate)
        : -i;

      return {value: -discounted, date};  // combine value with date
    }).reduce((i, j) => {
      if (j.value < 0 && i.values.length > 0) {
        const first = i.values[0];
        const withDiscountedValue = { value: first.value + j.value, date: first.date };
        const remainder = i.values.slice(1);
        const allValues = [withDiscountedValue].concat(remainder);

        return { values: allValues };
      } else {
        return { values: i.values.concat([j]) };
      }
    }, { values: [] }).values;
  }

  // Given an investment 'value' at time 'dateEnd', discount it to 'dateStart'
  // using the 'discountRate'.  This is the recommended method to calculate an
  // IRR value that is not total nonsense in the case where frequent capital
  // calls are made.
  //
  // Formula:
  //   NPV = F / (1 + i)^n
  // where
  //   NPV is the present (discounted) value,
  //   F is the future value,
  //   i is the discount rate, and
  //   n is the number of periods (in this case, fractional years).
  // 
  const getDiscountValue = function(value, yearDiff, discountRate) {
    const disc = discountRate / 100;  // convert from pct to fraction

    return yearDiff === 0 ? value : getPresentValue(value, disc, yearDiff);
  }

  // Return risk free rate of return for the given year
  //
  function getRiskFreeRate(year) {
    return riskFreeRates.hasOwnProperty(year) ? riskFreeRates[year] : null;
  }

  // Return the present value for 'value'
  //
  const getPresentValue = function(value, rate, years) {
    if (years === 0) {
      return 1;  // fixes case where rate and years are both 0
    } else {
      return value / Math.pow(1 + rate, years);
    }
  }
  
  // For a cash flow with two values, the formula for IRR is:
  //   0 = v0 + (v1 / (1 + r)^n)
  // whose solution is:
  //   r = nth-root(-v1/v0) - 1
  //
  const getRateForTwoValues = function(values, dates) {
    const inner = -(values[1] / values[0]);
    const n = moment(dates[1]).diff(moment(dates[0]), 'days') / 365;
    const nthRoot = Math.pow(inner, (1/n));
    const res = nthRoot - 1;

    return res;
  }

  // A method for calculating IRR that seems to be better than most.
  //
  const getBisection = function(values, dates, minRate, maxRate, guess, eps,
      maxIter) {
    var resultRate = guess;
    var lowRate = minRate;
    var highRate = maxRate;
    var half = 1;

    // Get the difference in days between all dates and the start date
    //
    const yearDiffs = getYearDiffs(dates);

    for (var i = 0; Math.abs(half) > eps && i < maxIter; ++i) {
      const low = irrResult(values, yearDiffs, lowRate);
      const high = irrResult(values, yearDiffs, highRate);
      if (Math.sign(low) === Math.sign(high)) {
        return '#NUM2!';
      }
      resultRate = (lowRate + highRate)/2;
      half = irrResult(values, yearDiffs, resultRate);
      if (Math.abs(half) > eps) {
        if (Math.sign(low) === Math.sign(half)) {  // signs are equal, so look in upper half
          lowRate = resultRate;
        } else {                // signs unequal, so look in bottom half
          highRate = resultRate;
        }
      }
    }
    return resultRate;
  }

  // Calculates the resulting amount
  //
  const irrResult = function(values, yearDiffs, rate) {
    return values.slice(1).reduce((i, j, k) => {
      return i + getPresentValue(j, rate, yearDiffs[k]);
    }, values[0]);
  }

  // Return the difference in years between the 0th date in 'dates'
  // and every other date in 'dates'
  //
  const getYearDiffs = function(dates) {
    const zeroMoment = moment(dates[0]);
    return dates.map(i => moment(i).diff(zeroMoment, 'days') / 365);
  }

  // Return calculated values for some finance metrics
  //
  function getDPI(rec, distributionField, picField) {
    const distribution = getValue(rec, distributionField, 0);
    const pic = getValue(rec, picField, 0);

    return distribution !== null && pic !== null && pic !== 0 ? distribution/pic : 0;
  }

  function getRVPI(rec, navField, picField) {
    const nav = getValue(rec, navField, 0);
    const pic = getValue(rec, picField, 0);

    return nav !== null && pic !== null && pic !== 0 ? nav/pic : 0;
  }

  function getTVPI(rec, navField, distributionField, picField) {
    return getDPI(rec, distributionField, picField) +
        getRVPI(rec, navField, picField);
  }

  function getCashFlow(rec, picField, distributionField) {
    return getValue(rec, distributionField, 0) - getValue(rec, picField, 0);
  }

  function add(rec, field1, field2) {
    return getValue(rec, field1, 0) + getValue(rec, field2, 0);
  }

  // To accumulate elements, use the already-generated field for
  // this record, and add it to the accumulated field in the previous record.
  //
  function getCumulative(rec, field, cumField, data, prev) {
    const value = getValue(rec, field, 0);
    const prevCumValue = getValue(prev, cumField, 0);

    return value + prevCumValue;
  }

  // This just muliplies the two values together.
  //
  function multiply(rec, field1, field2) {
    return getValue(rec, field1, 0) * getValue(rec, field2, 0);
  }

  function subtract(rec, field1, field2) {
    return getValue(rec, field1, 0) - getValue(rec, field2, 0);
  }

  // Return the total value.  It's calculated as:
  //   ((# shares) * (price per share)) + (all paid dividends)
  //
  function getTotalValue(rec, sharesField, priceField, dividendField) {
    const shares = getValue(rec, sharesField, 0);
    const price = getValue(rec, priceField, 0);
    const dividend = getValue(rec, dividendField, 0);
    return (shares * price) + dividend;
  }

  // Return the delta between 'field1' and 'field2' in rec.
  //
  // 'field2' is a field within the given 'benchmarkVector' of the same type
  // as 'field1'.
  // 'sortField' is the field within 'benchmarkVector' upon which we sort to
  // find the single benchmark for comparison: we want the 0th record post-sort.
  //
  // Return null if no comparison could be made.
  //
  function getDeltaFromBenchmarks(rec, field1, benchmarkVector, sortField, field2) {
    const vector = getValue(rec, benchmarkVector, []);
    const sorted = vector.sort((i, j) => {
      const iValue = i.hasOwnProperty(sortField) ? i[sortField] : 0;
      const jValue = j.hasOwnProperty(sortField) ? j[sortField] : 0;

      return iValue - jValue;
    });
    const recFromVector = sorted.length > 0 ? sorted[0] : {};
    const value1 = getValue(rec, field1, null);
    const value2 = getValue(recFromVector, field2, null);

    if (isNumber(value1) && isNumber(value2)) {
      return value1 - value2;
    } else {
      return null;
    }
  }

  // This is a pre-calculation, returning the entire dataset, sorted
  // for the values for 'field'.  Needed for getDecile below.
  //
  const sortForDecile = function(data, inputField, outputField) {
    const fractile = 0.1;  // deciles
    const sorted = data.sort((a, b) => {
      const aValue = getNumericValue(a, inputField);
      const bValue = getNumericValue(b, inputField);
      return aValue - bValue;
    });

    return sorted.map((i, j, array) => {
      const len = array.length;
      const frac = j / len;
      const fracBin = Math.floor(frac / fractile) + 1;

      return {...i, ...{[outputField]: fracBin}};
    });
  }

  // When returning the decile, we need only identify where the record
  // falls within the sortedData.  The decile field value has
  // already been calculated by the preTransform 'sortByDecile' above.
  //
  function getDecile(rec, inputField, outputField, sortedData) {
    const transformedRec = sortedData.find(i => {
      return i.id === rec.id;
    });
    return getValue(transformedRec, outputField, null);
  }

  const isNumber = function(n) {
    return !isNaN(n) && isFinite(n);
  }

  // Return numeric value of rec[field], or 0 if none or not numeric
  //
  const getNumericValue = function(rec, field) {
    const val = rec.hasOwnProperty(field) ? rec[field] : 0;

    return isNumber(val) ? val : 0;
  }

  // Given record and the field containing cash flow, return the 
  // inception date.  Should just be the date in the 0th flow.
  //
  function getInceptionDate(rec, flowField, dateField) {
    const allFlows = getAllFlows(rec, flowField, dateField);
    return allFlows.length > 0 ? getValue(allFlows[0], dateField, null) : null;
  }

  // Given a record with an array of array of cash flows, return
  // a single cash flow record (flattened), sorted by date.
  //
  // The result contains a new 'date' field, in Date object format.
  //
  function getAllFlows(rec, flowField, dateField) {
    const flows = getValue(rec, flowField, []);
    const allFlows = Array.isArray(flows) ? flows.map(i => {
      return Array.isArray(i) ? i.filter(j => {
        return getValue(j, dateField, null) !== null;
      }).map(j => {
        const date = new Date(getValue(j, dateField, null));

        return {...j, date};
      }) : [];
    }) : [];

    return [].concat.apply([], allFlows).sort((i, j) => {
      return i.date/1000 - j.date/1000;
    });
  }

  // Given a date string of the form YYYY/MM/DD, return the date in
  // ms since epoch
  //
  function getDateMS(rec, dateField) {
    const dateString = getValue(rec, dateField, null);
    return dateString ? +new Date(dateString) : null;
  }

  // Given a dataset, each record containing 'seriesField', convert the
  // data into a set of bins from 'binField'.
  //
  // 'datapointField' is the field representing the primary key in 'data'.
  //
  // 'aliasMap' is a mapping from every metadata element to its alias.
  // 'numericMap' is a map from a numeric field to its subtype and subtypeColumn;
  //   this is used to handle things like NAVs that aren't additive for a particular
  //   entity.
  //
  function getTimeSeries(datapointField, nRecordsField,
      seriesField, dateField, binField, binFieldMS,
      data, aliasMap, numericMap) {
    const cookedData = preProcessData(data, seriesField, dateField, numericMap);
    const sortedEvents = getSortedEvents(cookedData, datapointField,
        seriesField, dateField, aliasMap);

    // FIXME: Make the bin duration metadata-configurable, instead of
    // only allowing monthlies.
    //
    return binByMonth(sortedEvents, datapointField, nRecordsField,
      dateField, binField, binFieldMS,
      aliasMap, numericMap);
  }

  // Pre-process the dataset, so that things like e.g. NAVs can be summed
  // correctly.
  //
  function preProcessData(data, seriesField, dateField, numericMap) {
    const numericsByPeriodEntity = Object.keys(numericMap).filter(i => {
      return numericMap[i].subtype === 'byPeriodEntity';
    });

    return data.map((i, x) => {

      // We must keep in mind that the series is a 2-dimensional array, owing to
      // the way that vectors are accumulated in endpoint.js.
      //
      const series = [].concat.apply([], i.hasOwnProperty(seriesField) ? i[seriesField] : []);

      const newSeries = series.reduce((j, k) => {
        const dateString = k.hasOwnProperty(dateField) ? k[dateField] : null;
        const month = getMonthFromDateString(dateString);
        const prevByMonth = j.byMonth;
        const objForThisMonth = prevByMonth.hasOwnProperty(month) ? prevByMonth[month] : null;
        const subtypeValues = numericsByPeriodEntity.reduce((l, m) => {
          const thisValue = k.hasOwnProperty(m) ? k[m] : 0;
          const prevValue = objForThisMonth && objForThisMonth.hasOwnProperty(m)
            ? objForThisMonth[m]
            : 0;

          // Here's the tricky part.  We want to squash all values (make them 0) if there
          // is already a value set for the month.  That way, we will avoid adding the
          // same net asset values multiple times for a single entity (for example).
          //
          const curValue = prevValue ? 0 : thisValue;
          return {...l, ...{[m]: curValue}};
        }, {});

        const newRecord = {...k, ...subtypeValues};
        const output = j.output.concat([newRecord]);
        const newObjForThisMonth = objForThisMonth || subtypeValues;
        const byMonth = {...prevByMonth, ...{[month]: newObjForThisMonth}};

        return {output, byMonth};
      }, {output: [], byMonth: {}});

      return {...i, ...{[seriesField]: [newSeries.output]}};
    });
  }

  // Return a vector of all events, sorted by 'dateField'.
  // 'dateField' should be of type 'DateString', which can be
  // converted into a javascript Date.
  //
  // 'datapointField' is the alias of the datapoint column.  We
  // will push the datapoint value into each series record.
  //
  function getSortedEvents(data, datapointField, seriesField, dateField, aliasMap) {
    const datapointCol = aliasToColumn(aliasMap, datapointField);

    // Flatten the series from each record in 'data', pushing the name of
    // the datapoint into each time series record.
    //
    const eventsWithDatapoint = data.map(i => {
      const datapointVal = i[datapointField];
      const seriesVector = i.hasOwnProperty(seriesField) && Array.isArray(i[seriesField])
        ? i[seriesField] : [];
      return [].concat.apply([], seriesVector).map(i => {
        return {...i, ...{[datapointCol]: datapointVal}};
      });
    });

    return [].concat.apply([], eventsWithDatapoint).sort((i, j) => {
      const iDate = new Date(i.hasOwnProperty(dateField) ? i[dateField] : null);
      const jDate = new Date(j.hasOwnProperty(dateField) ? j[dateField] : null);
      return iDate/1000 - jDate / 1000;
    });
  }

  // Given an 'alias' and a map from column to alias in 'aliasMap',
  // find the column that maps to 'alias'.
  //
  function aliasToColumn(aliasMap, alias) {
    return Object.keys(aliasMap).reduce((i, j) => {
      return (aliasMap[j] === alias) ? j : i;
    }, null);
  }

  // Return 'rec', with new columns representing the aliases in 'aliasMap'.
  //
  function addAliasesForRecord(rec, aliasMap) {
    const withAliases = Object.keys(aliasMap).reduce((i, j) => {
      const alias = aliasMap[j];
      const value = rec.hasOwnProperty(j) ? rec[j] : null;

      return {...i, ...{[alias]: value}};
    }, {});

    return {...rec, ...withAliases};
  }

  // Bin all the data by month.
  // 'numericMap' is a map of numeric fields to their subtypes: some
  // subtypes are summed, others are summed by entity, and some are
  // cumulative values.
  // the referenced numeric values are summed by this routine.
  //
  function binByMonth(events, datapointField, nRecordsField,
      dateInputField, dateOutputField, dateOutputMSField,
      aliasMap, numericMap) {

    // If a numeric has subtype "byPeriod", it means that the
    // value for that numeric is constant for that period
    // (so we can simply use its value without summing it).
    //
    const numericsByPeriod = Object.keys(numericMap)
      .filter(i => numericMap[i].subtype === 'byPeriod')
      .reduce((i, j) => { return {...i, ...{[j]: true}}; }, {});

    // numericAliasesByMonth will contain numerics that should
    // NOT be accumulated.
    // Note that we don't deal with calculated fields yet; that comes
    // later in the pipeline.
    //
    const numericAliasesByMonth = Object.keys(numericMap).filter(i => {
      return numericsByPeriod.hasOwnProperty(i) &&
          !numericMap[i].calculated && 
          aliasMap[i] !== nRecordsField &&
          aliasMap[i] !== dateOutputMSField;
    }).map(i => aliasMap[i]);

    // numericAliases will contain only those numerics that are to
    // be accumulated, and that aren't calculated fields.
    // Note that we don't deal with calculated fields yet; that comes
    // later in the pipeline.  We also do not use the accumulator to
    // calculate the # of records and the output date.
    //
    const numericAliases = Object.keys(numericMap).filter(i => {
      return !numericsByPeriod.hasOwnProperty(i) &&
          !numericMap[i].calculated &&
          aliasMap[i] !== nRecordsField &&
          aliasMap[i] !== dateOutputMSField;
    }).map(i => aliasMap[i]);

    // Purge the aliases that don't exist in the 0th record.  These are
    // aliases that don't appear in cash flow records, and doing this
    // purge speeds up this aliasing process considerably.
    //
    const event0 = events.length > 0 ? events[0] : {};
    const purgedAliasMap = Object.keys(aliasMap).reduce((j, k) => {
      return event0.hasOwnProperty(k) ? {...j, ...{[k]: aliasMap[k]}} : j;
    }, {});

    const eventMap = events.reduce((i, j) => {

      // Add alias columns for every element from 'purgedAliasMap'.
      //
      const withAliases = addAliasesForRecord(j, purgedAliasMap);

      // We like using the string form of the month as the object key: it
      // makes it easy to verify that we've got the month binning and sorting right.
      //
      // But we need the monthMS to actually plot the data.
      //
      const dateString = withAliases.hasOwnProperty(dateInputField)
        ? withAliases[dateInputField]
        : null;
      const month = getMonthFromDateString(dateString);
      const monthMS = getMonthMSFromDateString(dateString);
      const prevObj = i.hasOwnProperty(month) ? i[month] : {};

      // We use a SUM aggregator for the numericAliases list.
      //
      const numericSums = numericAliases.reduce((k, l) => {
        const prevValue = prevObj.hasOwnProperty(l) ? +prevObj[l] : 0;
        const curValue = withAliases.hasOwnProperty(l) ? +withAliases[l] : 0;
        const accum = prevValue + curValue;
        return {...k, ...{[l]: accum}};
      }, {});

      // We choose the last visited value for the numericsByMonth list.
      //
      const numericsByMonth = numericAliasesByMonth.reduce((k, l) => {
        const curValue = withAliases.hasOwnProperty(l) ? +withAliases[l] : 0;
        return {...k, ...{[l]: curValue}};
      }, {});

      // List all of the datapoint values in the special 'datapointMap' field.
      // 
      const prevDatapointMap = prevObj.datapointMap || {};
      const thisDatapointVal = withAliases[datapointField];
      const thisDatapointMap = {[thisDatapointVal]: true};
      const datapointMap = {...prevDatapointMap, ...thisDatapointMap};

      const monthMSFld = {[dateOutputMSField]: monthMS};

      // Order is important here.  monthMSFld must be after the numerics,
      // since monthMS is numeric, but we do NOT want to sum it.
      //
      const thisMonth = {...numericSums, ...numericsByMonth, ...monthMSFld, 
          datapointMap};
      return {...i, ...{[month]: thisMonth}};
    }, {});

    return Object.keys(eventMap).map(i => {
      const obj = eventMap[i];
      const nDatapoints = obj.datapointMap ? Object.keys(obj.datapointMap).length : 0;
      const recsObj = {[nRecordsField]: nDatapoints};
      return {...{[dateOutputField]: i}, ...obj, ...recsObj};
    });
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
      'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Given a dateString that can be convered to javascript Date,
  // return a string form of its month and year, in the form 'MON YYYY'.
  //
  function getMonthFromDateString(dateString) {
    const date = new Date(dateString);
    if (date !== 'Invalid Date') {
      const month = months[date.getMonth()];
      return `${month} ${date.getFullYear()}`
    } else {
      return 'Invalid Date';
    }
  }

  // Return the MS from epoch for the first day of the month represented
  // in 'dateString', which is of the form 'mm/dd/yyyy'.
  //
  function getMonthMSFromDateString(dateString) {
    const dArray = dateString.split('/');
    const firstDateString = dArray.length == 3
      ? `${dArray[0]}/01/${dArray[2]}`
      : null;
    return +(new Date(firstDateString));
  }

  // Return map from Entity (id) to entity name.
  //
  // Note that entity names may be duplicated.  In that case, we use the entity
  // ID as a suffix.
  //
  // NOTE: This is used by two of the loaders, so we use DRY rule and
  // define the function here.
  //
  function getEntityMap(entities, entityKey) {
    const nameCountMap = entities.reduce((i, j) => {
      const name = j.Name;
      const count = i.hasOwnProperty(name) ? i[name] : 0;

      return {...i, ...{[name]: count + 1}};
    }, {});

    const withUniqueNames = entities.map(i => {
      const name = i.Name;
      const entity = i[entityKey];
      const fullName = nameCountMap[name] > 1 ? `${name} (${entity})` : name;
      
      return {...i, Name: fullName};
    });

    return withUniqueNames.reduce((i, j) => {
      const rec = {[j[entityKey]]: j};

      return {...i, ...rec};
    }, {});
  }

  // Return the value of the prior 'field' within 'data'.
  //
  function getPriorValue(data, idx, field, defaultValue) {
    const rec = (idx >= 0 ? data[idx-1] : {});
    return getValue(rec, field, defaultValue);
  }

  // Used to get a value for a 'calculated' field.
  //
  function getValue(rec, field, defaultValue) {
    return rec && rec.hasOwnProperty(field) ? rec[field] : defaultValue;
  }

  // Return the quarter for 'dateString'.  'dateString' is of the form: 'mm/dd/yyyy'.
  // The return is of the form:
  //   [03|06|09|12]/YYYY
  //
  // Note that we round the date *up* to get the nav *at the end of the quarter*,
  // even though that is a bit counter-intuitive.  The reason we do that is that
  // the flow table's initial date for an entity is *prior to* the reported NAV
  // for that entity, so it appears that AIS is assuming we can only do metrics
  // based on the next reported NAV date.
  //
  // If withDays is true, then return the 1st day of the quarter.
  //
  const getQuarter = function(dateString, withDays) {
    const splitDate = dateString.split('/');
    const month = +splitDate[0];
    const year = splitDate[2];
    const quarter = (1 + Math.floor((month - 1)/3)) * 3;
    const paddedQuarter = quarter < 10 ? '0' + quarter : '' + quarter;

    return withDays ? `${paddedQuarter}/01/${year}` : `${paddedQuarter}/${year}`;
  }

  // Return the floating point representation of 'formattedNum'.
  // Return 0 if there is a problem
  //
  function getFloat(formattedNum) {
    const parsed = parseFloat(formattedNum.replace(/,/g, ''));
    return isNumeric(parsed) ? parsed : 0;
  }

  // Return TRUE if 'dataset' represents a CSV file
  //
  const isCSV = function(dataset){
    const comps = dataset.split('.');
    return (comps[comps.length-1]==='csv');
  }

  const isJSON = function(dataset){
    const comps = dataset.split('.');
    return (comps[comps.length-1]==='json');
  }

  // Given the current redux state for pivot, return the currently
  // displayed state.
  //
  const getCurrentState = function(pivot) {
    if (pivot && Array.isArray(pivot.history) && pivot.current!==undefined) {
      const { history, current } = pivot;
      const len = history.length;
      const idx = current<0? 0 : (current>len? current.len-1 : current);
      return history[idx];
    } else {
      return null;
    }
  }

  const compose = (...fns) => x => {
    return fns.reduceRight((i, j) => j(i), x);
  }

  return {
    safeVal,
    getSafe,
    getMinRange,
    getAllUniqueValues,
    getUniqueValues,
    getMap,
    sorter,
    alphaSort,
    flatten,
    truncate,
    isNumeric,
    isDate,
    getDaysInMonth,
    getWorkdaysInMonth,
    getAllFlows,
    getXIRRfromGroup,
    getXIRRfromFlow,
    getXIRR,
    getDPI,
    getRVPI,
    getTVPI,
    getCashFlow,
    add,
    getCumulative,
    multiply,
    subtract,
    getTotalValue,
    getDeltaFromBenchmarks,
    sortForDecile,
    getDecile,
    getInceptionDate,
    getDateMS,
    getTimeSeries,
    binByMonth,
    getMonthFromDateString,
    getEntityMap,
    getQuarter,
    getFloat,
    isCSV,
    isJSON,
    getCurrentState,
    compose
  }

}();

export default utils;
