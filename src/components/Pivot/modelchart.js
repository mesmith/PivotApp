import React from 'react';
import {Grid, Row, Col, Button} from 'react-bootstrap';

import erlangC from './erlangc';
import erlangA from './erlangA';
import metadata from './metadata';
import utils from './utils';

// Metadata for this special component
//
const meta = {
  daysWorkedField: metadata.getAlias('ticketSummary_daysWorkPerCall'),
  calls: metadata.getAlias('# Records'),
  waitHours: metadata.getAlias('waitHours'),
  analyst: '# ' + metadata.getAlias('Target Name'),
  handleTimeCalculated: metadata.getAlias('handleSecs'),
  handleTime: metadata.getAlias('TOTAL EDIT TIME'),
  handleTimeRaw: metadata.getAlias('workHours'),
  handleTimeRaw100: metadata.getAlias('workHours_100'),
  talkHours: metadata.getAlias('talkHours'),
  role: metadata.getAlias('ticketSummary_Role'),
  abandonedCallsRegular: metadata.getDatasetAttr('abandonedCallsRegular'),
  abandonedCallsNW: metadata.getDatasetAttr('abandonedCallsNW'),
  balkPercent: metadata.getDatasetAttr('balkPercent'),

  nightWeekend: {
    role: 'N/W',  // Name of night/weekend categorical value
    onlyWeek: 'week', // If only regular workers ("weekly") are included
    onlyNW: 'nw',   // If only night/weekend workers are included
    both: 'both', // If both kinds of workers are included
  }
};

// Implement the React modeling chart
//
// Allows user to input:
// - current abandonment rate
// - a percentage for any level 1 or level 2 ticket types
//
// Will calculate the current analyst load at saturation.
//
class ModelChart extends React.Component {
  constructor(props) {

    super(props);
    const nightWeekendState = this.getNightWeekendState(props.data);

    // We need to get the total # of days in the dataset, as well as
    // the total # of working days (so we can calculate agent shrinkage and
    // utilization)
    //
    const days = this.getDays(props.months);
    const workingDays = this.getWorkdays(props.months);
    const shrinkage =
        Math.round(this.getShrinkageFromProps(props, workingDays) * 100);
    const abandonedCallsRegular =  Math.round(meta.abandonedCallsRegular * (1 - meta.balkPercent));
    const abandonedCallsNW = Math.round(meta.abandonedCallsNW * (1 - meta.balkPercent));

    this.state = {
      days, workingDays, shrinkage,
      abandonedCallsRegular,
      abandonedCallsNW,
      onHoldTime: 30,  // SLA threshold, in seconds
      probAnsweringWithinOnHold: 80, // SLA threshold, in percentage
      desiredAnalystUtilization: 100 - shrinkage,
      shifts: this.getShifts(nightWeekendState)
    }
  }

  // Given a vector of months, return the total # of working days in those months
  //
  getWorkdays(months) {
    return Array.isArray(months) ? months.reduce((i, j) => {
      const mmyy = j.split('/');
      const days = utils.getWorkdaysInMonth(mmyy[0], mmyy[1]);

      return i + days;
    }, 0) : 0;
  }

  // Given a vector of months, return the total # of days in those months
  //
  getDays(months) {
    return Array.isArray(months) ? months.reduce((i, j) => {
      const mmyy = j.split('/');
      const days = utils.getDaysInMonth(mmyy[0], mmyy[1]);

      return i + days;
    }, 0) : 0;
  }

  // Called when any input field changes
  //
  onInputChange(field) {
    return (e) => {
      const num = e.target.value;
      this.setState({[field]: num});
    }
  }

  // Return the average wait time, using Erlang C model
  //
  getAverageWaitTimeErlangC(calls, periodMinutes, averageHandleTime, nAgents,
      shifts, desiredAnalystUtilization) {
    if (!utils.isNumeric(nAgents)) {
      return Infinity;
    }
    const rawWaitTime = erlangC.AverageSpeedOfAnswer(nAgents, calls, periodMinutes, averageHandleTime);

    return Math.round(rawWaitTime * 60);
  }

  // Find the # of staff to handle 'calls' over period of time 'period',
  // with average call time 'averageHandleTime',
  // and with 'serviceLevel' probability of service (e.g. .9 for 90%) within 'targetTime'.
  //
  // 'targetTime' may be 0, if we want to model how many agents we need for no waiting
  // with 'serviceLevel' probability.
  //
  // calls/period, averageHandleTime, and targetTime can be in minutes,
  // but really they can be any time period, as long as they are the
  // *same* time period.
  //
  getOptimalStaffFromModel(callsPerMinute, averageHandleTime, desiredServiceLevel,
      targetTime, patience, model) {
    const maxAgents = 500;  // sooner or later we run out of budget :)
    const trafficIntensity = erlangC.TrafficIntensity(callsPerMinute, averageHandleTime);
    // const begin = Math.ceil(trafficIntensity);
    const begin = 1;

    // Always assume that we need more agents than the traffic intensity.  The
    // functions work when agents < begin, but they have ugly values and aren't useful.
    //
    for (var agents=begin; agents<=maxAgents; agents++) {
      const serviceLevel = this.getServiceLevel(agents, callsPerMinute, averageHandleTime, 
          targetTime, patience, model);

      if (serviceLevel > desiredServiceLevel)
      {           
        return agents;
      }
    }       

    return 'More than 500';
  }

  // Traffic intensity is call arrival rate, times averageHandleTime.
  // Calculate
  //   1 - probOfWaiting * e ** (-1 * (agents - trafficIntensity) * (targetTime / averageHandleTime))
  // which is the service level at targetTime.
  //
  // Note that the entire right hand term is 1 if targetTime is 0.
  //
  getServiceLevel(agents, callsPerMinute, averageHandleTime, targetTime, patience, model) {
    const probOfWaiting = this.getProbOfWaiting(agents, callsPerMinute, averageHandleTime, patience, model);
    const trafficIntensity = erlangC.TrafficIntensity(callsPerMinute, averageHandleTime);
    const nMinusA = agents - trafficIntensity;

    return (1 - probOfWaiting * Math.pow(Math.E, -1 * nMinusA * (targetTime / averageHandleTime)));
  }

  // Return probability of waiting, using 'model'
  //
  getProbOfWaiting(agents, callsPerMinute, averageHandleTime, patience, model) {
    const trafficIntensity = erlangC.TrafficIntensity(callsPerMinute, averageHandleTime);
    switch (model) {
      case 'erlangA': {
        // const basicStaff = Math.ceil(trafficIntensity);
        // const n = basicStaff; // * 1.5;
        const n = agents;
        const lam = callsPerMinute;
        const mu = 1 / averageHandleTime;  // reciprocal of average handle time, called "service rate"

        const theta = 1 / patience;
        const eaObj = erlangA.ErlangA(n, lam, mu, theta);
        return eaObj ? erlangA.waitingProbability(eaObj.axy, eaObj.pn) : Infinity;
      }
      case 'erlangC': {
        return erlangC.ErlangC(agents, trafficIntensity);
      }
      default: {
        return null;
      }
    }
  }

  // Return various projections, using Erlang A model.
  //
  getProjections(agents, calls, periodMinutes, averageHandleTime, patience, trafficIntensity) {
    const n = agents < 1 ? 1 : agents;
    const lam = calls / periodMinutes;  // arrival rate
    const mu = 1 / averageHandleTime;  // reciprocal of average handle time, called "service rate"
    const theta = 1 / patience;

    const eaObj = erlangA.ErlangA(n, lam, mu, theta);
    const waitingProb = erlangA.waitingProbability(eaObj.axy, eaObj.pn);
    const abandonmentProbIfDelayed = erlangA.abandonProbIfDelayed(eaObj.rho, eaObj.axy);
    const abandonmentProb = erlangA.abandonmentProbability(eaObj.rho, eaObj.axy, eaObj.pn);
    const meanWaitingTime = erlangA.meanWaitingTime(eaObj.rho, eaObj.axy, eaObj.pn, theta);
    const meanWaitingIfDelayed = erlangA.meanWaitingIfDelayed(theta, eaObj.rho, eaObj.axy);
    const avgQueueLen = erlangA.avgQueueLen(lam, eaObj.rho, eaObj.axy, eaObj.pn, theta);
    const throughput = erlangA.getThroughput(n, mu, lam, eaObj.rho, eaObj.axy, eaObj.pn);
    const pn = erlangA.getPN(n, eaObj.ti, eaObj.axy);
    return {abandonmentProb, abandonmentProbIfDelayed, waitingProb, meanWaitingTime, meanWaitingIfDelayed,
        avgQueueLen, throughput, pn};
  }

  getStaffAfterShiftAndUtilization(n, shifts, desiredAnalystUtilization) {
    const withShifts = n * shifts;
    const withUtilization = withShifts / (desiredAnalystUtilization/100);

    return Math.round(withUtilization);
  }

  // Return the average percentage of a work day that the average analyst in this
  // model is not handling calls.
  //
  getShrinkageFromProps(props, workingDays) {
    const data = props.data;
    const aggregateLoadFraction = this.getAggregateLoadFraction(props.loadComparisonData);

    const handleTime = data[meta.handleTime];  // in seconds, from TOTAL EDIT TIME
    const talkSecs = data[meta.talkHours] * 60 * 60;

    const totalDaysWorked = data[meta.daysWorkedField];
    const calls = data[meta.calls];
    const analysts = data[meta.analyst];

    // The actual analyst load is the percentage of regular working days that the analysts
    // actually worked.  For example, if an analyst worked 7 days in a quarter,
    // the number will be about 7 / 63.
    //
    const actualAnalysts = this.getActualAnalysts(totalDaysWorked, workingDays);
    const handleTimePerAnalyst = handleTime / actualAnalysts / 3600;  // in hours
    const dailyHandleTimePerAnalyst = (handleTimePerAnalyst / workingDays);

    // Shrinkage gets worse if there is a load change.  Adjust for that.
    //
    const handleTimeAfterLoad = dailyHandleTimePerAnalyst / aggregateLoadFraction;

    return this.getShrinkage(handleTimeAfterLoad);
  }

  getShrinkage(dailyHandleTimePerAnalyst) {
    const first = 1 - dailyHandleTimePerAnalyst / 8;
    const second = first < 0 ? 0 : first;

    return second > 1 ? 1 : second;
  }

  getActualAnalysts(totalDaysWorked, workingDays) {
    return totalDaysWorked / workingDays;
  }

  // Return the night/weekend state of the data:
  //   onlyWeek: 'week', // If only regular workers ("weekly") are included
  //   onlyNW: 'nw',   // If only night/weekend workers are included
  //   both: 'both', // If both kinds of workers are included
  //
  getNightWeekendState(data) {
    const roles = this.getRoles(data);

    return roles.reduce((i, j) => {
      if (j === meta.nightWeekend.role) {
        return i === null ? meta.nightWeekend.onlyNW : meta.nightWeekend.both;
      } else {
        return i === null || i === meta.nightWeekend.onlyWeek ?
            meta.nightWeekend.onlyWeek : meta.nightWeekend.both;
      }
    }, null);
  }

  // Return list of roles in the data
  //
  getRoles(data) {
    const fieldName = meta.role;
  
    if (!Array.isArray(data)) {
      return [];
    }
    return Object.keys(data).filter(i => {
      const catVar = i.split(':')[0];
      const catVal = i.split(':')[1];

      return catVar === '# ' + fieldName && catVal;
    }).map(i => {
      return i.split(':')[1];
    });
  }

  // Return the # of minutes within this period.  This varies, depending on whether
  // we are doing 24x7 or regular working days.
  //
  getPeriodMinutes(nightWeekendState, days, workingDays) {
    switch (nightWeekendState) {
      case meta.nightWeekend.both: {
        return days * 24 * 60;
      }
      case meta.nightWeekend.onlyWeek: {
        return workingDays * 16 * 60;
      }
      default: {
        const weekendDays = days - workingDays;

        return (workingDays * 8 + weekendDays * 24) * 60;
      }
    }
  }

  // Return the # of shifts supported.  This depends on whether we are doing
  // 24/7, 16/5, or just night/weekend.  The result is the # of shifts in a day,
  // normalized to a 5-day workweek (which is the "typical" way that an analyst works).
  //
  // If we take 24/7 operation, then the # of shifts 3 * (7/5), because there
  // are 3 shifts in a day, and there are also 3 shifts across 2 weekend days.
  //
  // If we take 16/5 operation, then the # of shifts is just 2.
  //
  getShifts(nightWeekendState) {
    switch (nightWeekendState) {
      case meta.nightWeekend.both: {
        return +((3 * (7/5)).toFixed(2));
      }
      case meta.nightWeekend.onlyWeek: {
        return 2;
      }
      default: {
        return (5 + (3*2)) / 5;  // 5 night shifts, 3 shifts across weekend,
                                 // normalized to 5-day workweek
      }
    }

    return nightWeekendState === meta.nightWeekend.both ? +(3 * (7/5)).toFixed(2) :
      (nightWeekendState === meta.nightWeekend.onlyWeek ? 2 : null);
  }

  getAbandonment(nightWeekendState, abandonmentRegular, abandonmentNW) {
    switch (nightWeekendState) {
      case meta.nightWeekend.both: {
        return abandonmentRegular + abandonmentNW;
      }
      case meta.nightWeekend.onlyWeek: {
        return abandonmentRegular;
      }
      default: {
        return abandonmentNW;
      }
    }

    return nightWeekendState === meta.nightWeekend.both ? +(3 * (7/5)).toFixed(2) :
      (nightWeekendState === meta.nightWeekend.onlyWeek ? 2 : null);
  }

  // Return the fraction of the data that was reduced due to applying load factors.
  //
  getAggregateLoadFraction(loadComparisonData) {
    if (!loadComparisonData ||
        !loadComparisonData.hasOwnProperty(meta.handleTimeRaw) ||
        !loadComparisonData.hasOwnProperty(meta.handleTimeRaw100)) return 1;

    const loaded = loadComparisonData[meta.handleTimeRaw];
    const orig = loadComparisonData[meta.handleTimeRaw100];
    if (!utils.isNumeric(orig) || !utils.isNumeric(loaded) || orig == 0) return 1;

    return loaded / orig;
  }

  componentWillReceiveProps(props) {
    const { days, workingDays } = this.state;
    const shrinkage =
        Math.round(this.getShrinkageFromProps(props, workingDays) * 100);
    const nightWeekendState = this.getNightWeekendState(props.data);
    const shifts = this.getShifts(nightWeekendState);
    const desiredAnalystUtilization = 100 - shrinkage;
    this.setState({ shrinkage, shifts, desiredAnalystUtilization });
  }

  render(){
    const { abandonedCallsRegular, abandonedCallsNW,
        probAnsweringWithinOnHold, onHoldTime,
        shifts, desiredAnalystUtilization,
        days, workingDays
    } = this.state;
    const data = this.props.data;
    const nightWeekendState = this.getNightWeekendState(data);
    const abandonedCalls =
        this.getAbandonment(nightWeekendState, abandonedCallsRegular, abandonedCallsNW);
    const totalDaysWorked = data[meta.daysWorkedField];

    if (!data.hasOwnProperty(meta.calls)) {
      return null;
    }

    const calls = data[meta.calls];
    const waitHours = data[meta.waitHours];
    const avgWaitTimeMinutesPerCall = (waitHours * 60) / calls;
    const totalCalls = calls + abandonedCalls;
    const analysts = data[meta.analyst];

    // const handleTimeFromSummary = data[meta.handleTimeSummary];  // in seconds
    const handleTime = data[meta.handleTime];  // in seconds
    // const handleTime = data[meta.handleTime] * 1.5;  // in seconds
    const talkSecs = data[meta.talkHours] * 60 * 60;

    const actualAnalysts = this.getActualAnalysts(totalDaysWorked, workingDays);
    const utilization = desiredAnalystUtilization / 100; 
    const workingAnalysts = (actualAnalysts * utilization) / shifts;

    const inboundCallsPerAnalyst = totalCalls / actualAnalysts;
    const handledCallsPerAnalyst = calls / actualAnalysts;
    const handleTimePerAnalyst = handleTime / actualAnalysts / 3600;  // in hours
    const abandonmentRate = abandonedCalls / totalCalls;

    const averageHandleTime = handleTime / calls / 60;  // in minutes

    const periodMinutes = this.getPeriodMinutes(nightWeekendState, days, workingDays);
    const serviceLevel = probAnsweringWithinOnHold / 100;  // in percentage
    const targetTime = onHoldTime / 60;  // in minutes
    const arrivalRate = totalCalls / periodMinutes;

    const dailyHandleTimePerAnalyst = (handleTimePerAnalyst / workingDays);
    const callsPerMinute = totalCalls / periodMinutes;

    const trafficIntensity = erlangC.TrafficIntensity(callsPerMinute, averageHandleTime);

    const patience = avgWaitTimeMinutesPerCall / abandonmentRate;

    // Get some Erlang projections.
    //
    const rawStaff = this.getOptimalStaffFromModel(callsPerMinute, averageHandleTime, serviceLevel,
        targetTime, patience, 'erlangA');
    const projAvgWaitTimeSecsEC = this.getAverageWaitTimeErlangC(totalCalls, periodMinutes, 
      averageHandleTime, rawStaff, shifts, desiredAnalystUtilization);

    const optimalStaffErlangA = this.getStaffAfterShiftAndUtilization(rawStaff, shifts,
        desiredAnalystUtilization);
    const projections = this.getProjections(rawStaff, totalCalls, periodMinutes,
        averageHandleTime, patience, trafficIntensity);
    const projAvgWaitTimeSecs = projections.meanWaitingTime * 60;

    const rawStaffLower = Math.ceil(trafficIntensity);
    const staffForTrafficIntensity = this.getStaffAfterShiftAndUtilization(rawStaffLower,
        shifts, desiredAnalystUtilization);

    const projAvgWaitTimeSecsLowerEC = this.getAverageWaitTimeErlangC(totalCalls, periodMinutes,
      averageHandleTime, rawStaffLower, shifts, desiredAnalystUtilization);

    const projectionsLower = this.getProjections(rawStaffLower, totalCalls, periodMinutes,
        averageHandleTime, patience, trafficIntensity);
    const projAvgWaitTimeSecsLower = projectionsLower.meanWaitingTime * 60;

    const rawStaffCurrent = workingAnalysts;

    const projectionsCurrent = this.getProjections(rawStaffCurrent, totalCalls, periodMinutes,
        averageHandleTime, patience, trafficIntensity);
    const projAvgWaitTimeSecsCurrent = projectionsCurrent.meanWaitingTime * 60;
    const showClass = this.props.show ? 'chartShow' : 'chartNone';

    return (
      <Grid className={"model-chart " + showClass}>
        <Row>
          <h2>Labor Model</h2>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            # Analysts, Adjusted for Days Worked:
          </Col>
          <Col sm={3}>
            {actualAnalysts.toFixed(2)}
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            # Concurrent Working Analysts:
          </Col>
          <Col sm={3}>
            {workingAnalysts.toFixed(2)}
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Traffic Intensity:
          </Col>
          <Col sm={3}>
            {trafficIntensity.toFixed(2)}
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Arrival Rate (Calls per Minute):
          </Col>
          <Col sm={3}>
            {arrivalRate.toFixed(2)}
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Average Wait Time, Actual (Minutes):
          </Col>
          <Col sm={3}>
            {avgWaitTimeMinutesPerCall.toFixed(2)}
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Calls per Analyst, All:
          </Col>
          <Col sm={3}>
            {inboundCallsPerAnalyst.toFixed(2)}
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Calls per Analyst, Connected:
          </Col>
          <Col sm={3}>
            {handledCallsPerAnalyst.toFixed(2)}
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Handling Time per Analyst (Hours):
          </Col>
          <Col sm={3}>
            {handleTimePerAnalyst.toFixed(2)}
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Daily Handling Time per Analyst (Hours):
          </Col>
          <Col sm={3}>
            {dailyHandleTimePerAnalyst.toFixed(2)}
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            <label> Average Handling Time per Call (Minutes):</label>
          </Col>
          <Col sm={3}>
            {averageHandleTime.toFixed(2)}
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Abandonment Rate:
          </Col>
          <Col sm={2}>
            {Math.round(abandonmentRate*100)}
          </Col>
          <Col sm={1}>%</Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            # Abandoned Calls:
          </Col>
          <Col sm={3}>
            {abandonedCalls}
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Average Patience until Abandonment (Minutes):
          </Col>
          <Col sm={3}>
            {patience.toFixed(2)}
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            <label> Calculated Analyst Aggregate Utilization:</label>
          </Col>
          <Col sm={2}>
            {100 - this.state.shrinkage}
          </Col>
          <Col sm={1}>%</Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            <label> Desired Analyst Aggregate Utilization:</label>
          </Col>
          <Col sm={2}>
            <input value={this.state.desiredAnalystUtilization} 
                onChange={this.onInputChange('desiredAnalystUtilization')}
                className="model-input"
                type="text" />
          </Col>
          <Col sm={1}>%</Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            <label> Desired Max Wait Time (Seconds):</label>
          </Col>
          <Col sm={3}>
            <input value={this.state.onHoldTime} 
                onChange={this.onInputChange('onHoldTime')}
                className="model-input"
                type="text" />
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            <label> Desired Probability of Answering within On-Hold Time:</label>
          </Col>
          <Col sm={2}>
            <input value={this.state.probAnsweringWithinOnHold} 
                onChange={this.onInputChange('probAnsweringWithinOnHold')}
                className="model-input"
                type="text" />
          </Col>
          <Col sm={1}>%</Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            <label> # of Shifts (for 24/7 operation, use 4.2):</label>
          </Col>
          <Col sm={3}>
            <input value={this.state.shifts} 
                onChange={this.onInputChange('shifts')}
                className="model-input"
                type="text" />
          </Col>
        </Row>

        <Row>
          <hr />
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            <label> # Concurrent Analysts Needed, Upper Bound:</label>
          </Col>
          <Col sm={3}>
            <label> {rawStaff} </label>
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            <label> # Total Analysts Needed, Upper Bound:</label>
          </Col>
          <Col sm={3}>
            <label> {optimalStaffErlangA} </label>
          </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Projected Average Wait Time (Minutes):
          </Col>
          <Col sm={3}> {(projAvgWaitTimeSecs/60).toFixed(2)} </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Projected Abandonment Rate:
          </Col>
          <Col sm={2}> {Math.round(projections.abandonmentProb*100)} </Col>
          <Col sm={1}> % </Col>
        </Row>

        <Row>
          <hr />
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            # Concurrent Analysts Needed, Lower Bound:
          </Col>
          <Col sm={3}> {rawStaffLower} </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            # Total Analysts Needed, Lower Bound:
          </Col>
          <Col sm={3}> {staffForTrafficIntensity} </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Projected Average Wait Time (Minutes):
          </Col>
          <Col sm={3}> {(projAvgWaitTimeSecsLower/60).toFixed(2)} </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            Projected Abandonment Rate:
          </Col>
          <Col sm={2}> {Math.round(projectionsLower.abandonmentProb*100)} </Col>
          <Col sm={1}> % </Col>
        </Row>

        <Row>
          <hr />
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            For Current Staffing, Projected Average Wait Time (Minutes):
          </Col>
          <Col sm={3}> {projectionsCurrent.meanWaitingTime.toFixed(2)} </Col>
        </Row>

        <Row>
          <Col className="model-chart-label" sm={9}>
            For Current Staffing, Projected Abandonment Rate:
          </Col>
          <Col sm={2}> {Math.round(projectionsCurrent.abandonmentProb*100)} </Col>
          <Col sm={1}> % </Col>
        </Row>


      </Grid>
    )
  }
}

export default ModelChart;
