// mongodb app to load CSV data
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

  // Be very careful here.  Do not make this anything but 0 unless we
  // are sure there is time skew between ticket and ACD.
  //
  const ticketSkew = 0;  // in minutes

  // This is used to put a time boundary on tickets assigned to a call.
  //
  const shiftGapHours = 8;  // in hours
  const shiftWiggleHours = 24; // in hours

  // This is used to avoid assigning too large of a handling time
  // to a ticket that happens well after a call
  //
  const handlingMaxHours = 2; // in hours

  // This is used to calculate the handling time of a ticket that was
  // created more than handlingMaxHours after the call.  We set its
  // handling time to 4 minutes, arbitrarily, based on observation.
  //
  const defaultTicketHandlingMinutes = 4;

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

  const incidentTypeFld = 'Incident Type';

  console.debug = console.log;
  const ticketSchema = {
    id: 'Ticket #',
    analyst: 'Assigned Account',
    date: 'Date Created',
    time: null,
    level1: 'Subject Level 1',
    level2: 'Subject Level 2',
    level3: 'Subject Level 3',
    multiple: 'Multiple',
    service: 'Incident S/A'
  };

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
  const roleMeta = {
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
// ticketData = ticketData.slice(0, 500);
// callData = callData.slice(0, 5000);
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
      return i[incidentTypeFld] === 'Phone';
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
    const ticketMap = getAnalystMap(phoneTicketData, ticketSchema.analyst);

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
    //
    const callMap = getAnalystMap(callDataWithTimes, 'analyst');
    const callMapWithShifts = getShifts(callMap);
    const callMapWithTickets = getCandidateTickets(callMapWithShifts, ticketMap);
    const unassignableTickets = getUnassignableTickets(callMapWithTickets, ticketMap);
    const nUnassignableTickets = getNUnassignableTickets(unassignableTickets);

    const callMapWithAssignableTickets = assignTicketsToCalls(callMapWithTickets);

    const flatData = getFlattened(callMapWithAssignableTickets);

    // Add ticket summary.  Note that the name of the analyst from the ticketSummaryMap
    // is actually the name from the call dataset, not the ticket dataset, so we
    // use callSchema to find it.
    //
    // We pass in the callMap so that we can get an average handling time per call
    // for each analyst.
    //
    const callsWithTickets = getWithTicketSummary(flatData, ticketSummaryMap, callSchema,
        callsPerAnalyst);

    const nMatchedTickets = getNMatchedTickets(callsWithTickets);
    const nUnmatchedTickets = phoneTicketData.length - nMatchedTickets;

    // const nMatchableHisto = getMatchableHistogram(callsWithTickets);
    const unassignableHisto = getUnassignableHisto(unassignableTickets);

// console.log('UNASSIGNED TICKETS:');
// console.log(unassignableTickets);

    // Reporting
    //
    const nInbound = callsWithTickets.length;
    const nWithTickets = getNumCallsWithTickets(callsWithTickets);
    const minUnmatched = nInbound - phoneTicketData.length;
    const nWithoutTickets = nInbound - nWithTickets;
    const nRemainingUnmatched = nWithoutTickets - minUnmatched;

    console.log('************');
    console.log('# Tickets: ' + ticketDataTAC.length);
    console.log('# Phone Tickets: ' + phoneTicketData.length);
    console.log('# Matched Phone Tickets: ' + nMatchedTickets);
    console.log('# Unmatched Phone Tickets: ' + nUnmatchedTickets);
    console.log('# Unassignable Phone Tickets: ' + nUnassignableTickets);
    console.log('# Unassignable by Analyst: '); console.log(unassignableHisto);
    console.log('');
    console.log('# Connected Calls: ' + callDataTAC.length);
    console.log('# Outbound Calls: ' + outboundCalls.length);
    console.log('# Inbound Calls: ' + nInbound);
    console.log('# Inbound Calls with Tickets: ' + nWithTickets);
    console.log('# Inbound Calls without Tickets: ' + nWithoutTickets);
    console.log('Minimum Possible Calls without Tickets: ' + minUnmatched);
    console.log('Possible Remaining Ticket Matches: ' + nRemainingUnmatched);
    // console.log('');
    // console.log('Ticket Match Histogram: '); console.log(nMatchableHisto);
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

  // This adds calculations for the shift end for each call.
  //
  const getShifts = function(callMap) {
    return Object.keys(callMap).reduce((i, j) => {
      const oldRecs = callMap[j];
      const newRecs = oldRecs.map((k, l) => {
        const remainder = oldRecs.slice(l);  // all records past this one
        const shiftEndEpoch = getShiftEnd(remainder);
        const shiftEndDateTime = time.msecToDateTime(shiftEndEpoch);

        return {...k, shiftEndEpoch, shiftEndDateTime};
      });
      return {...i, ...{[j]: newRecs}};
    }, {});
  }

  // Given the remainder of calls, calculate the shift end for 'analyst'.
  // It's returned as an epoch.
  //
  // The shift end is the time of the last call prior to a shift gap,
  // plus some wiggle room (allowing time for the analyst to write
  // tickets at end of shift).
  //
  // Return null if there was a problem.
  //
  const getShiftEnd = function(remainder) {
    const gap = shiftGapHours * 60 * 60 * 1000;  // ms representing shiftGapHours
    const wiggle = shiftWiggleHours * 60 * 60 * 1000;  // ms representing shiftWiggleHours
    if (remainder.length === 0) return null;

    var lastTime = remainder[0].callCloseEpoch;
    if (!isNumber(lastTime)) return null;

    var done = false;
    for (var i = 1; i != remainder.length && !done; ++i) {
      const thisTime = remainder[i].callCloseEpoch;

      if (isNumber(thisTime) && thisTime > lastTime + gap) {
        done = true;
      } else {
        lastTime = thisTime;
      }
    }

    return lastTime + wiggle;
  }

  // Append candidate tickets to each call record in 'callMap'.
  // Candidate tickets are tickets that:
  // - are Phone tickets, and
  // - are created after the analyst takes the call, and
  // - are created during the shift of the analyst.
  //
  const getCandidateTickets = function(callMap, ticketMap) {
    return Object.keys(callMap).reduce((i, j) => {
      const newRecords = callMap[j].map(k => {
        const tickets = getCandidateTicketsForCall(k, ticketMap);

        return {...k, tickets};
      });
      return {...i, ...{[j]: newRecords}};
    }, {});
  }

  // Return candidate (phone) tickets for the single 'callRecord'.
  //
  // A candidate ticket must have been entered no earlier than the
  // answer time in callRecord.
  //
  const getCandidateTicketsForCall = function(callRecord, ticketMap) {
    const callAnalyst = callRecord[callSchema.analyst];
    const analyst = callRecord.analyst;
    const agentTickets = ticketMap.hasOwnProperty(analyst) ?  ticketMap[analyst] :
        (ticketMap.hasOwnProperty(callAnalyst) ? ticketMap[callAnalyst] : null);
    if (!agentTickets) {
      return null;
    }

    const answerEpoch = callRecord.answerEpoch;

    // tickets have minute granularity
    //
    const answerMinute = getMinute(answerEpoch);
    const shiftEndEpoch = callRecord.shiftEndEpoch;
    if (!isNumber(answerEpoch) || !isNumber(shiftEndEpoch)) {
      return null;
    }

    // Note that we allow some skew for the ticket, allowing the ticketing
    // system to be out of sync relative to the call system.
    //
    // Update: Avoid using skew.  Too hard to track problems down.
    //
    return agentTickets.filter(i => {
      const ticketOpenMinute = isNumber(i.lastTicketOpenEpoch) ?
        getMinute(i.lastTicketOpenEpoch) + ticketSkew : null;

      const res = ticketOpenMinute &&
          ticketOpenMinute >= answerMinute &&
          i.lastTicketOpenEpoch < shiftEndEpoch;

      return res;
    });
  }

  // Return list of phone tickets that can't be assigned to any call
  //
  const getUnassignableTickets = function(callMap, ticketMap) {
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

  // Given a map of calls by analyst and candidate tickets, apply a rule to
  // assign ticket(s) to each call.
  // The rule is:
  //   - If the next call's start-talk time is prior to the first candidate
  //     ticket's open time, then assign no tickets.
  //     Otherwise, assign all the tickets for that analyst up to the
  //     time of the next call (but not past shift end).
  //
  // This assignment rule fails the real world test if:
  // - the analyst fills out tickets out of call order, or
  // - the analyst waits until she answers a 2nd call
  //   prior to filling out a ticket for the 1st call, or
  // - the analyst gets another analyst to fill out a ticket, or
  // - the analyst waits until the next shift before filling out a ticket
  //
  // Some calls result in multiple tickets.  In that case, we classify the
  // call according to the first ticket.  But we use all of the tickets to
  // calculate the handling time.
  //
  var assignments = {};
  const assignTicketsToCalls = function(callMapWithTickets) {
    const res = Object.keys(callMapWithTickets).reduce((i, j) => {
      const callRecords = callMapWithTickets[j];
      const recordsWithTicket = callRecords.map((k, l) => {
        const nextIdx = l + 1;
        const nextCallRecord = callRecords.length > nextIdx ?
            callRecords[nextIdx] : null;
        const nextAnswerEpoch = nextCallRecord ? nextCallRecord.answerEpoch : null;

        // We want to find out how many tickets that this call might be
        // able to match.  If it's more than one, we will add up the
        // effort to create those tickets as part of the handling time
        // of the call.
        //
        const matchableTickets = getNextUnassignedTickets(k.tickets, 
            assignments, nextAnswerEpoch);

        const anyMatch =
            Array.isArray(matchableTickets) && matchableTickets.length > 0;
        const multiMatch =
            Array.isArray(matchableTickets) && matchableTickets.length > 1;

        const ticket = anyMatch ? matchableTickets[0] : getCallWithoutTicket();
        ticket.nMatchable = anyMatch ? matchableTickets.length : 0;

        // Handle case where multiple tickets are assigned to the call.
        // The last ticket gives us the handle end time.
        //
        const dfltMulti = {[ticketSchema.multiple]: null};
        const multiple = multiMatch ? getMultipleTicketType(matchableTickets) : dfltMulti;
        const withMultiple = {...ticket, ...multiple};

        // Record the assignment, so a ticket is never assigned to
        // more than one call.
        //
        matchableTickets.forEach(i => {
          const ticketNum = i[ticketSchema.id];

          assignments[ticketNum] = true;
        });

        const withTicketData = {...k, ticket: withMultiple}

        // Now that we have the start time for the last ticket
        // (in lastTicketOpenEpoch), use that to calculate the handle time
        //
        const handleSecs = getHandleSecs(withTicketData, matchableTickets);
        const handleMinutes = handleSecs / 60;
        const handleHours = handleSecs / 3600;

        return {...withTicketData, handleSecs, handleMinutes, handleHours};
      });

      return {...i, ...{[j]: recordsWithTicket}};
    }, {});

    return res;
  }

  // Return an object fragment representing a call with no ticket
  //
  const getCallWithoutTicket = function() {
    return {
      [ticketSchema.level1]: 'No Ticket',
      [ticketSchema.level2]: 'No Ticket',
      [ticketSchema.level3]: 'No Ticket',
      [ticketSchema.service]: 'No Ticket'
    };
  }

  // Return list of tickets in 'tickets' that aren't already assigned, and
  // that won't be assigned to the next call (from nextAnswerEpoch).
  //
  const getNextUnassignedTickets = function(tickets, assignments, 
      nextAnswerEpoch) {
    const ticketFld = ticketSchema.id;

    return Array.isArray(tickets) ? tickets.filter(i => {
      const ticketNum = i[ticketFld];

      return !assignments.hasOwnProperty(ticketNum) &&
          (!nextAnswerEpoch || 
            getMinute(nextAnswerEpoch) >= getMinute(i.lastTicketOpenEpoch));
    }) : [];
  }

  // Handle the case where the analyst worked on multiple tickets for a
  // single call.
  //
  // In this case, we create a new Multiple ticket category, and get
  // the time that the analyst handled the last of the multiple tickets.
  // 
  const getMultipleTicketType = function(matchableTickets) {
    const ticket = matchableTickets[0];
    const last = matchableTickets[matchableTickets.length - 1];
    const lastTicketOpenDateTime = last.lastTicketOpenDateTime;
    const lastTicketOpenEpoch = +new Date(lastTicketOpenDateTime);

    return {
      [ticketSchema.level1]: ticket[ticketSchema.level1],
      [ticketSchema.level2]: ticket[ticketSchema.level2],
      [ticketSchema.level3]: ticket[ticketSchema.level3],
      [ticketSchema.multiple]: getAllLevel1(matchableTickets),
      lastTicketOpenDateTime,
      lastTicketOpenEpoch
    };
  }

  // Return a string representing the Level 1 of all matchable tickets
  // for a call.
  //
  const getAllLevel1 = function(matchableTickets) {
    return Object.keys(matchableTickets.reduce((i, j) => {
      const level1 = j[ticketSchema.level1];

      return {...i, ...{[level1]: true}};
    }, {}));
  }

  // Given a call record joined with (possibly multiple) ticket data,
  // return the call handle time.
  //
  // The call handle time is the lastTicketOpenEpoch minus the answerEpoch,
  // unless talkSecs is greater.
  //
  // The idea is that the analyst has to do ticket work after the call,
  // and during that time the analyst is unavailable for calls.
  //
  const getHandleSecsOld = function(rec) {
    const talkSecs = rec.talkSecs;

    if (!rec.ticket || !rec.ticket.lastTicketOpenEpoch) {
      return talkSecs;
    }

    const handleTicketSecs = 
        (rec.ticket.lastTicketOpenEpoch - rec.answerEpoch) / 1000;

    return talkSecs > handleTicketSecs ? talkSecs : handleTicketSecs;
  }

  // Given a call record joined with (possibly multiple) ticket data,
  // return the call handle time.
  //
  // We obtain call handling time by looking at the start time of all of the
  // tickets assigned to the call.  The answerEpoch of the call is the
  // time that worked started, and the start time of any ticket is assumed
  // to be when worked stopped (on that ticket).
  //
  // A special case happens when a ticket was worked on much later than
  // the time of the call.  In that case, we calculate the work time to be
  // the analyst talk time, plus a default ticket handling time.
  //
  // The returned value is the largest of the handling times.
  //
  const getHandleSecs = function(rec, matchableTickets) {
    const talkSecs = rec.talkSecs;

    if (!rec.ticket || !rec.ticket.lastTicketOpenEpoch) {
      return talkSecs;
    }

    const ticketHandlingTime = matchableTickets.reduce((i, j) => {
      const candidateHandlingTime = j.lastTicketOpenEpoch - rec.answerEpoch;
      const candidateHandlingTimeSecs = candidateHandlingTime / 1000;
      const candidateHandlingTimeHours = candidateHandlingTime / (1000 * 3600);
      const calculatedHandlingTime = (candidateHandlingTimeHours > handlingMaxHours) ?
          talkSecs + (defaultTicketHandlingMinutes * 60) : candidateHandlingTimeSecs;

      return (i > calculatedHandlingTime) ? i : calculatedHandlingTime;
    }, talkSecs);

    return ticketHandlingTime;
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
      return i[ticketSchema.level1] !== null && i[ticketSchema.level1] !== 'None';
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

  // Return a histogram of (analyst, # unassignable tickets)
  //
  const getUnassignableHisto = function(ticketMap) {
    return Object.keys(ticketMap).map(i => {
      return {name: i, value: ticketMap[i].length};
    }).sort((a, b) => {
      return b.value - a.value;
    }).map(i => {
      return i.name + ': ' + i.value;
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
