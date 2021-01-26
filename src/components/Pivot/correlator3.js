// This routine is used specifically for 1QFY2019 TAC call center data;
// it combines multiple CSV files, does some very tricky joins between them,
// and loads the result into a MongoDB collection called 'CallsWithTickets'.
//
/* eslint-disable no-console */
//
import metadata from './metadata';
import constants from './constants';
import time from './time';
import fs from 'fs';
import csv from 'csvtojson';
import { MongoClient } from 'mongodb';

const correlator = function(){
  const connectString = 'mongodb://localhost:27017/pivotDb';

  // Name misspellings occurring in the call table.
  //
  const callTableNameMap = {
    'Veronika Cruz': 'Veranika Cruz'
  };

  // The following analysts are not in the TAC.  They are in Recruit Assist,
  // or were trainees.
  //
  // We do not want to use them in the analysis.
  //
  const noTAC = [
    'Bill Snorgrass', // recruit assist
    'Janice Young',
    'Luis Martinez',
    'Tony Morton',
    'Rory Jones',
    'Shameka Sheppard',

    'Drake Farley', // trainees
    'Daniel Greene',
    'Unique Taylor',
  ];


  console.debug = console.log;
  const ticketSchema = {
    id: 'Ticket #',
    incidentType: 'Incident Type',
    analyst: 'Assigned Account',
    date: 'Date Created',
    time: null,
    level1: 'Subject Level 1',
    level2: 'Subject Level 2',
    level3: 'Subject Level 3',
    multiple: 'Multiple',
    service: 'Incident S/A',
    workSecs: 'TOTAL EDIT TIME' // note: this is same as tacttime from ticket summary
  };
  const noTicketValue = 'No Ticket';

  // Summary of the ticket schema.  Most of these are values
  // after renaming them to have the ticketSummary_ prefix
  // (which is added in order to distinguish this part of the join from
  // the ticket and call data).
  //
  const ticketSummarySchema = {
    analyst: 'analyst',
    total: 'ticketSummary_tacttime',
    role: 'ticketSummary_Role',
    rolePre: 'Role',
    days: 'ticketSummary_dayswork',
    numericFields: [
      'ticketSummary_dayswork',
      'ticketSummary_tcreated',
      'ticketSummary_tworked',
      'ticketSummary_tixxday',
      'ticketSummary_tacttime'
    ],
    categoricalFields: [
      'ticketSummary_Role'
    ]
  };

  const callSchema = {
    analyst: 'Target Name',
    date: 'Date',
    time: 'Time',
    duration: 'Duration',
    talk: 'Talk Time',
    wait: 'Wait Time'
  };

  // Record the percentage of a day that a particular role works on traveler calls.
  //
  const roleMetaOld = {
    GEN: 1,
    'N/W': 1,  // Night/weekend.
    CTO: .5, // half-timer
    FIN: .5, // half-timer
    TECH: .5, // half-timer
    'LEAD/SUPPORT': 1, // from Rich's direction
    SUPPORT: .1, // guess
    'NON-TAC': 0,
    RA: 0
  };

  // We are now setting this to be 100% of everything, so this includes
  // chat tickets.  We'll use other methods to get utilization
  //
  const roleMeta = {
    GEN: 1,
    'N/W': 1,  // Night/weekend.
    CTO: 1, // half-timer
    FIN: 1, // half-timer
    TECH: 1, // half-timer
    'LEAD/SUPPORT': 1, // from Rich's direction
    SUPPORT: 1, // guess
    'NON-TAC': 0,
    RA: 0
  };

  const correlate = function() {
    readOne('TicketWithSubjectTree').then(ticketData => {
      readOne('Connected Calls FY19 Q1').then(callData => {
        readOne('TicketSummaryFY19Q1').then(ticketSummaryData => {
          metadata.setMetadata('CallsWithTickets');
          const joinData = getJoin(ticketData, callData, ticketSummaryData);
          connectAndLoad(connectString, 'CallsWithTickets', joinData);
        });
      });
    });
  }

  // Join ticket data and call data.  They are joined by analyst and
  // date.
  //
  const getJoin = function(ticketData, callData, ticketSummaryData) {
// ticketData = ticketData.slice(0, 1000);
// callData = callData.slice(0, 10000);
//
// ticketData = ticketData.filter(i => {
  // const beginEpoch = +new Date('12/30/2018');
  // const ticketEpoch = getStartTime(i, ticketSchema);

  // return i['Assigned Account'] === 'Cheri B' && ticketEpoch > beginEpoch;
// });
// callData = callData.filter(i => {
  // return i.Date === '12/30/2018' && i['Target Name'] === 'Cheri Braithwaite';
// });
    // Some of the analysts aren't in the TAC.  Remove them.
    //
    const ticketDataTAC = getTACAnalysts(ticketData, ticketSchema, noTAC);
    const callDataTAC = getTACAnalysts(callData, callSchema, noTAC);

    // Convert the ticket summary into a map by analyst
    //
    const ticketSummaryMap = getSummaryMap(ticketSummaryData, ticketSummarySchema);

    // Some of the names in the call data are wrong.  Fix them
    //
    const nameField = callSchema.analyst;
    const callDataFixedNames = callDataTAC.map(i => {
      const oldName = i[nameField];
      const name = callTableNameMap.hasOwnProperty(oldName) ? 
          callTableNameMap[oldName] : oldName;

      return {...i, ...{[nameField]: name}};
    });

    // Get phone tickets with ticket open in epoch time
    //
    const phoneTicketData = ticketDataTAC.filter(i => {
      return i[ticketSchema.incidentType] === 'Phone';
    }).map(i => {
      const lastTicketOpenEpoch = getStartTime(i, ticketSchema);
      const lastTicketOpenDateTime = time.msecToDateTime(lastTicketOpenEpoch);

      return {...i, lastTicketOpenEpoch, lastTicketOpenDateTime};
    });

    const analysts = callDataFixedNames.reduce((i, j) => {
      const analyst = j[callSchema.analyst];

      return analyst ? {...i, ...{[analyst]: true}} : i;
    }, {});

    // Index tickets by analyst.  Names here are of the form
    // "first last-initial", unless they have a special mapping.
    //
    const ticketMapUnsorted = getAnalystMap(phoneTicketData, ticketSchema.analyst);
    const ticketMapFiltered = filterTicketMap(ticketMapUnsorted);
    const ticketMap = sortTicketMap(ticketMapFiltered);

    // Some calls are outbound from the TAC.  For now, we'll throw these out.
    //
    const outboundCalls = callDataFixedNames.filter(i => {
      return !i[callSchema.analyst];
    }).map(decorate);

    const outboundWithFakeTickets = getOutboundTickets(outboundCalls, analysts);

    // This will add artificial calculated fields to the call data.
    //
    const callDataWithTimes = callDataFixedNames.filter(i => {
      return i[callSchema.analyst];
    }).map(decorate);

    // Record the # calls per analyst (using call schema name), which will
    // be used later when getting average handling time using ticket summary data.
    //
    const callsPerAnalyst = getCallsPerAnalyst(callDataWithTimes, callSchema);

    // Now get a call map (indexed by analyst).
    // Use the newly created 'analyst' field.
    // Then sort the call map so that the longest calls are first.
    //
    const callMapUnsorted = getAnalystMap(callDataWithTimes, 'analyst');
    const callMap = sortCallMap(callMapUnsorted);
    const callMapWithTickets = getCandidateTickets(callMap, ticketMap);
    const callMapWithAssignedTickets = assignTicketsToCalls(callMapWithTickets);
    const flatData = getFlattened(callMapWithAssignedTickets);

    // Add ticket summary.  Note that the name of the analyst from the ticketSummaryMap
    // is actually the name from the call dataset, not the ticket dataset, so we
    // use callSchema to find it.
    //
    // We pass in the callMap so that we can get an average handling time per call
    // for each analyst.
    //
    const callsWithTickets = getWithTicketSummary(flatData, ticketSummaryMap, callSchema,
        callsPerAnalyst);

    // Gather unassigned ticket info
    //
    const unassignedTickets = getUnassignedTickets(callMapWithTickets, ticketMap);
    const nUnassignedTickets = getNUnassignableTickets(unassignedTickets);
    const unassignedHisto = getUnassignedHisto(unassignedTickets);

    // Reporting
    //
    const nInbound = callsWithTickets.length;
    const nWithTickets = getNumCallsWithTickets(callsWithTickets);
    const nWithoutTickets = nInbound - nWithTickets;

    console.log('************');
    console.log('# Tickets: ' + ticketDataTAC.length);
    console.log('# Phone Tickets: ' + phoneTicketData.length);
    console.log('# Unassigned Tickets: ' + nUnassignedTickets);
    console.log('# Unassigned Tickets by Analyst: '); console.log(unassignedHisto);
    console.log('');
    console.log('# Connected Calls: ' + callDataTAC.length);
    console.log('# Outbound Calls: ' + outboundCalls.length);
    console.log('# Inbound Calls: ' + nInbound);
    console.log('# Inbound Calls with Tickets: ' + nWithTickets);
    console.log('# Inbound Calls without Tickets: ' + nWithoutTickets);
    console.log('************');
    console.log('');

    // Currently, I think we should not model outbound calls.
    // Some of them take up agent time,
    // but they do not let us model the traveler calls
    // that we need to meet SLA on.  Perhaps they are useful as part of
    // calculating Average Handling Time, but...not yet.
    //
    // return callsWithTickets.concat(outboundWithFakeTickets);
    return callsWithTickets;
  }

  // Given ticket summary data, convert into a map.
  // While doing this, we will also prefix every field name with 'ticketSummary_',
  // and we will also sum variables across multiple rows (each representing a single
  // month of ticket work).
  //
  const getSummaryMap = function(ticketSummaryData, schema) {
    const prefix = 'ticketSummary_';
    return ticketSummaryData.reduce((i, j) => {
      const analyst = j[schema.analyst];
      const nvPairs = Object.keys(j).filter(k => {
        return k !== schema.analyst;
      }).reduce((k, l) => {
        const mangled = prefix + l;

        return {...k, ...{[mangled]: j[l]}};
      }, {});

      const accumulate = getAccumulatedSummary(i, analyst, nvPairs, schema);

      return {...i, ...accumulate};
    }, {})
  }

  // Given an existing 'map' where we add 'nvPairs' for 'analyst', add any
  // existing values from 'map' and return the resulting object.
  //
  const getAccumulatedSummary = function(map, analyst, nvPairs, schema) {
    const oldRec = map.hasOwnProperty(analyst) ? map[analyst] : {};
    const newRec = getSummaryFields(nvPairs, schema);
    const merged = mergeSummaryFields(oldRec, newRec, schema);

    return {[analyst]: merged};
  }

  // Merge 'oldRec' with 'newRec'.
  // We add numeric values, and retain categorical values from 'oldRec'.
  //
  // We'll use only hundredths for fractions.
  //
  const mergeSummaryFields = function(oldRec, newRec, schema) {
    const numerics = schema.numericFields.reduce((i, j) => {
      const oldVal = oldRec.hasOwnProperty(j) ? +oldRec[j] : 0;
      const newVal = newRec.hasOwnProperty(j) ? +newRec[j] : 0;
      const sum = +((oldVal + newVal).toFixed(2));

      return {...i, ...{[j]: sum}};
    }, {});

    return {...newRec, ...numerics};
  }

  const getSummaryFields = function(rec, schema) {
    const categoricals = schema.categoricalFields.reduce((i, j) => {
      const value = rec.hasOwnProperty(j) ? rec[j] : '';

      return {...i, ...{[j]: value}};
    }, {});

    const numerics = schema.numericFields.reduce((i, j) => {
      const value = rec.hasOwnProperty(j) ? +rec[j] : 0;

      return {...i, ...{[j]: value}};
    }, {});
    return {...categoricals, ...numerics};
  }

  // Return dataset with any non-TAC analysts filtered out
  //
  const getTACAnalysts = function(data, schema, blacklist) {
    const blacklistMap = blacklist.reduce((i, j) => {
      return {...i, ...{[j]: true}};
    }, {});
    const analystField = schema.analyst;

    return data.filter(i => {
      const analyst = i.hasOwnProperty(analystField) ? i[analystField] : null;

      return !blacklistMap.hasOwnProperty(analyst);
    });
  }

  // Add new fields to the call record
  //
  const decorate = function(i) {
    const callAnalyst = i[callSchema.analyst];
    const analyst = getTicketAnalystName(callAnalyst);
    const duration = i[callSchema.duration];
    const durationSecs = getSeconds(duration);
    const durationMinutes = durationSecs / 60;
    const talk = i[callSchema.talk];
    const talkSecs = getSeconds(talk); // # seconds traveler and analyst talk
    const talkMinutes = talkSecs / 60;
    const talkHours = talkSecs / 3600;
    const wait = i[callSchema.wait];
    const waitSecs = getSeconds(wait); // # seconds traveler and analyst wait
    const waitMinutes = waitSecs / 60;
    const waitHours = waitSecs / 3600;
    const callOpenEpoch = getStartTime(i, callSchema);
    const callOpenDateTime = time.msecToDateTime(callOpenEpoch);
    const callCloseEpoch = getDeltaEpoch(callOpenEpoch, duration);
    const callCloseDateTime = time.msecToDateTime(callCloseEpoch);
    const answerEpoch = getDeltaEpoch(callCloseEpoch, talk, '-');
    const answerDateTime = time.msecToDateTime(answerEpoch); // answer date/time

    return {...i, callOpenEpoch, callOpenDateTime,
        answerEpoch, answerDateTime, callCloseEpoch,
        callCloseDateTime, analyst, 
        durationSecs, durationMinutes,
        talkSecs, talkMinutes, talkHours,
        waitSecs, waitMinutes, waitHours};
  }


  // Return a map containing the # calls per analyst, using the callSchema's
  // name for the analyst
  //
  const getCallsPerAnalyst = function(callData, callSchema) {
    const analystField = callSchema.analyst;
    return callData.reduce((i, j) => {
      const analyst = j[analystField];
      const prev = i.hasOwnProperty(analyst) ? i[analyst] : 0;

      return {...i, ...{[analyst]: prev + 1}};
    }, {});
  }

  // Return a map of 'data' by analyst, where 'analystField' is where to
  // find the analyst within 'data'
  //
  const getAnalystMap = function(data, analystField) {
    return data.reduce((i, j) => {
      const analyst = j[analystField];
      const prev = i.hasOwnProperty(analyst) ? i[analyst] : [];
      const next = prev.concat(j);

      return {...i, ...{[analyst]: next}};
    }, {});
  }

  // Return the call map so that every call per analyst is sorted with
  // the longest calls first
  //
  const sortCallMap = function(callMap) {
    const talkField = callSchema.talk;

    return Object.keys(callMap).reduce((i, j) => {
      const recs = callMap[j].sort((a, b) => {
        const aSecs = +a.talkSecs;
        const bSecs = +b.talkSecs;

        return bSecs - aSecs;
      });

      return {...i, ...{[j]: recs}};
    }, {});
  }

  // Return the ticket map, with 0-work or unknown-work tickets removed
  //
  const filterTicketMap = function(ticketMap) {
    const workField = ticketSchema.workSecs;
    return Object.keys(ticketMap).reduce((i, j) => {
      const recs = ticketMap[j].filter(k => {
        const workSecs = k.hasOwnProperty(workField) ? k[workField] : null;

        return isNumber(workSecs) && workSecs != 0;
      });

      return {...i, ...{[j]: recs}};
    }, {});
  }

  // Return ticket map so that every ticket per analyst is sorted with
  // the longest ticket work times first
  //
  const sortTicketMap = function(ticketMap) {
    const workField = ticketSchema.workSecs;
    return Object.keys(ticketMap).reduce((i, j) => {
      const recs = ticketMap[j].sort((a, b) => {
        const aWork = a.hasOwnProperty(workField) ? +a[workField] : 0;
        const bWork = b.hasOwnProperty(workField) ? +b[workField] : 0;

        return bWork - aWork;
      });

      return {...i, ...{[j]: recs}};
    }, {});
  }

  // Return candidate tickets.  At this time, this will return either 1 or 0
  // tickets for each call.
  //
  const getCandidateTickets = function(callMap, ticketMap) {
    return Object.keys(callMap).reduce((i, j) => {
      const ticketsForAnalyst = ticketMap.hasOwnProperty(j) ? ticketMap[j] : [];
      const newRecords = callMap[j].map((k, l) => {
        const ticket = l < ticketsForAnalyst.length ? ticketsForAnalyst[l] : null;

        return {...k, tickets: ticket ? [ticket] : []};
      });
      return {...i, ...{[j]: newRecords}};
    }, {});
  }

  // New assignment of tickets to calls.  This is just a simple routine that
  // assumes that the ticket is already present in the call.
  //
  // The only trick is that this will assign a valid time to the workSecs field.
  // Usually it will get this number from the ticket work, not the call work,
  // as per Rich's direction.
  //
  const assignTicketsToCalls = function(callMapWithTickets) {
    const workSecsField = ticketSchema.workSecs;
    const talkField = callSchema.talk;
    return Object.keys(callMapWithTickets).reduce((i, j) => {
      const recordsWithTicket = callMapWithTickets[j].map((k, l) => {
        const talkSecs = getSeconds(k[talkField]);
        const oldTicket = k.tickets.length > 0 ? k.tickets[0] : getMissingTicket();
        const workSecsRaw = +oldTicket[workSecsField];
        const workSecs = workSecsRaw && isNumber(workSecsRaw) ? workSecsRaw : talkSecs;
        const workHours = workSecs / 3600;
        const workHours_100 = workHours;  // allows us to do what-if tests against original
        const workObj = {[workSecsField]: workSecs, [workSecsField+' ORIG']: workSecsRaw};
        const ticket = {...oldTicket, ...workObj};

        return {...k, ...ticket, workSecs, workHours, workHours_100};
      });

      return {...i, ...{[j]: recordsWithTicket}};
    }, {});
  }

  // Return list of phone tickets that can't be assigned to any call
  //
  const getUnassignedTickets = function(callMap, ticketMap) {
    const idField = ticketSchema.id;

    const assignments = Object.keys(callMap).reduce((i, j) => {
      const assignedForAnalyst = callMap[j].reduce((k, l) => {
        const tickets = Array.isArray(l.tickets) ? l.tickets : [];
        const analystTicketMap = tickets.reduce((m, n) => {
          const id = n[idField];

          return {...m, ...{[id]: true}};
        }, {});

        return {...k, ...analystTicketMap};
      }, {});

      return {...i, ...assignedForAnalyst};
    }, {});

    return Object.keys(ticketMap).reduce((i, j) => {
      const tickets = ticketMap[j];

      const unassigned = tickets.filter((k) => {
        const id = k[idField];

        return !assignments.hasOwnProperty(id);
      });

      return {...i, ...{[j]: unassigned}};
    }, {});
  }

  const getNUnassignableTickets = function(map) {
    return Object.keys(map).reduce((i, j) => {
      return i + map[j].length;
    }, 0);
  }

  // Return an object fragment representing a call with no ticket
  //
  const getMissingTicket = function() {
    return {
      [ticketSchema.level1]: noTicketValue,
      [ticketSchema.level2]: noTicketValue,
      [ticketSchema.level3]: noTicketValue,
      [ticketSchema.service]: noTicketValue
    };
  }

  // Return an object fragment representing a ticket with no call
  //
  const getMissingCall = function () {
    return {
      [callSchema.date]: '12/31/2018',  // fake end of quarter
      [callSchema.time]: '00:00:00',    // fake midnight
      [callSchema.duration]: 0,
      [callSchema.talk]: 0,
      [callSchema.wait]: 0
    };
  }

  const getMinute = function(epoch) {
    return Math.floor(epoch / 60000);
  }

  // Now that we've assigned tickets within 'callMap',
  // return the calls as a flat array
  //
  const getFlattened = function(callMap) {
    const nrecs = constants.sumrecords;

    // Let's only get the attributes that we will manipulate later, rather than
    // the entire join.  But make sure to ignore the '# Records' 
    // artificial attribute, as well as averaging columns: the latter are
    // calculated when pulling the data from mongo.
    //
    const allColumns = metadata.getAll().filter(i => {
      return i !== nrecs && !metadata.isTrue(i, 'isAverage');
    });

    return [].concat.apply([], Object.keys(callMap).map(i => {
      return callMap[i].map(j => {
        const thisRec = {...j, ...j.ticket}; // flatten ticket data

        return allColumns.reduce((k, l) => {
          const value = thisRec.hasOwnProperty(l) ? thisRec[l] : null;
          return {...k, ...{[l]: value}};
        }, {});
      });
    }));
  }

  // Return 'data', a flat array, that includes data from the ticketSummaryMap
  //
  const getWithTicketSummary = function(data, ticketSummaryMap, schema, callsPerAnalyst) {
    const ticketSecsField = ticketSummarySchema.total;
    const roleField = ticketSummarySchema.role;
    const daysWorkedField = ticketSummarySchema.days;

    return data.map(i => {
      const analyst = i[schema.analyst];
      const nCalls = callsPerAnalyst.hasOwnProperty(analyst) ? callsPerAnalyst[analyst] : 0;
      const summaryData = analyst && ticketSummaryMap.hasOwnProperty(analyst) ?
          ticketSummaryMap[analyst] : {};
      
      // This gets the total # secs worked for the analyst, and divides by the
      // number of calls, which should yield a decent ticket work/call number.
      //
      // The idea behind all of this is that the data will be split into calls,
      // so we need to create artificial "metric per call" fields in order for
      // the data to aggregate properly at runtime.
      //
      const totalSecs = summaryData.hasOwnProperty(ticketSecsField) ?
          summaryData[ticketSecsField] : 0;
      const role = summaryData.hasOwnProperty(roleField) ? summaryData[roleField] : '';
      const daysWorked = summaryData.hasOwnProperty(daysWorkedField) ?
          summaryData[daysWorkedField] : '';

      // Get utilization as a percentage
      const utilization = (totalSecs / (daysWorked * 8 * 60 * 60)) * 100;

      // Note rawSecsPerCall_100.  This allows us to keep track of
      // the ticket work prior to applying any "what if" scenarios.
      //
      const workPerCall = getWorkPerCall(totalSecs, nCalls, role);
      const daysPerCall = daysWorked / nCalls;
      const metrics = {
        ticketSummary_rawSecsPerCall: totalSecs / nCalls,
        ticketSummary_rawSecsPerCall_100: totalSecs / nCalls,
        ticketSummary_secsPerCall: workPerCall,
        ticketSummary_minutesPerCall: workPerCall / 60,
        ticketSummary_hoursPerCall: workPerCall / 3600,
        ticketSummary_daysWorkPerCall: daysPerCall,
        ticketSummary_utilization: utilization
      };
      return {...i, ...summaryData, ...metrics};
    });
  }

  // Given total seconds worked on tickets for a period, the total # of calls handled,
  // and the role of the analyst, return the work per call.
  //
  // We assume that some tickets are for calls, and some are not; if the role indicates
  // that the user is a half-timer, we only take 1/2 of the ticket time when applying
  // it to calls.
  //
  const getWorkPerCall = function(totalSecs, nCalls, role) {
    const roleFrac = roleMeta.hasOwnProperty(role) ? roleMeta[role]: 0;
    return roleFrac * (totalSecs / nCalls);
  }

  // Return # of output records that have a ticket assignment
  //
  const getNumCallsWithTickets = function(callsWithTickets) {
    return callsWithTickets.filter(i => {
      return i[ticketSchema.level1] !== null && i[ticketSchema.level1] !== noTicketValue;
    }).length;
  }

  // Add useful fake information for outbound calls.
  //
  const getOutboundTickets = function(outboundCalls, analysts) {
    const categories = {
      'Subject Level 1': 'Outbound',
      'Subject Level 2': 'Outbound',
      'Subject Level 3': 'Outbound',
      'Incident Type': 'Outbound',
      'Incident S/A': 'Outbound',
      'Caller Name': 'Outbound',
      'Assigned Account': 'Outbound',
      'Target Name': 'Outbound',
      analyst: 'Outbound',
      'Date Created': null
    };
    const outboundField = 'Caller Name';  // This is the name of outbound caller
    const outboundTicketName = 'Assigned Account';
    const inboundName = 'Target Name';

    // Sometimes, the Caller Name is an analyst name, in which case we could
    // assign the call to the analyst.  But most outbound calls aren't like that,
    // so for now we avoid adding noise.
    //
    return outboundCalls.map(i => {
      const callAnalyst = i['Caller Name'];
      if (analysts.hasOwnProperty(callAnalyst)) {
        const analyst = getTicketAnalystName(callAnalyst);
        return {
          ...i,
          ...categories,
          [callSchema.analyst]: callAnalyst,
          [ticketSchema.analyst]: analyst,
          analyst
        };
      } else {
        return {...i, ...categories};
      }
    });
  }

  // Count the tickets assigned to calls.
  //
  const getNMatchedTickets = function(data) {
    return data.reduce((i, j) => {
      return i + j.nMatchable;
    }, 0);
  }

  // Return a histogram of matchable tickets
  //
  const getMatchableHistogram = function(data) {
    return data.reduce((i, j) => {
      const cur = j.nMatchable || 0;
      const prev = i.hasOwnProperty(j.nMatchable) ? i[j.nMatchable] : 0;
      const withCur = prev + 1;

      return {...i, ...{[j.nMatchable]: withCur}};
    }, {});
  }

  // Return a histogram of (analyst, # unassigned tickets)
  //
  const getUnassignedHisto = function(ticketMap) {
    const workSecsField = ticketSchema.workSecs;
    return Object.keys(ticketMap).map(i => {
      const secs = ticketMap[i].reduce((j, k) => {
        return j + (+k[workSecsField]);
      }, 0);
      return {name: i, value: ticketMap[i].length, hours: secs/3600};
    }).sort((a, b) => {
      return b.value - a.value;
    }).filter(i => {
      return i.value > 0;
    }).map(i => {
      return `${i.name}: ${i.value}, working hours=${i.hours}`;
    });
  }

  const isNumber = function(n) {
    return !isNaN(n) && isFinite(n);
  }

  // Given a rec with schema, return the embedded date attribute's epoch
  //
  const getStartTime = function(rec, schema) {
    const date = schema.date ? rec[schema.date] : null;
    const time = schema.time ? rec[schema.time] : null;
    return date ? (time ? +new Date(date + ' ' + time) : +new Date(date)) : null;
  }

  // Add time in 'delta' to epoch time.
  // delta is of the form: HH:MM:SS.
  // Returns 'epoch' if delta is malformed.
  //
  // direction can be null or '-'.  If it's '-', do a subtraction.
  //
  const getDeltaEpoch = function(epoch, delta, direction) {
    const newDelta = getSeconds(delta) * 1000;

    return direction === '-' ? epoch - newDelta : epoch + newDelta;
  }

  // Given a duration of the form HH:MM:SS, return the number of seconds.
  // Return 0 if there was a problem.
  //
  const getSeconds = function(delta) {
    const split = delta? delta.split(':') : [];
    if (split.length === 3) {
      const hh = +split[0];
      const mm = +split[1];
      const ss = +split[2];
      return (hh * 3600 + mm * 60 + ss);
    } else {
      return 0;
    }
  }

  // Given an analyst 'name' from the call record, return a name
  // that is in the format used in the ticket dataset.
  //
  const getTicketAnalystName = function(name) {
    const splitName = name ? name.split(' ') : [];
    if (splitName.length > 1) {
      const first = name.split(' ')[0];
      const last = name.split(' ')[1];
      return first + ' ' + last[0];
    } else {
      return name;
    }
  }

  const readOne = function(dataset, cb){
    const location = '../data/' + dataset + '.csv';

    metadata.setMetadata(dataset);
    const numerics = metadata.getNonAverageNumerics();

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
        collection.insertMany(data).then(result => {
          console.log('Loaded ' + dataset);
          process.exit(0);
        });
      });
    })
    .catch(function(err){
      return console.dir(err);
    });
  }

  return {
    correlate
  }
}();

correlator.correlate();
