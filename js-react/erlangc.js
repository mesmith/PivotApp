const erlangC = function(){

  // Return average speed of answer, given # agents.
  // 
  function AverageSpeedOfAnswer(agents, calls, period, averageHandleTime)
  {
    const n = Math.round(agents);
    const callsPerPeriod = calls / period;
    const trafficIntensity = TrafficIntensity(callsPerPeriod, averageHandleTime);

    const occ = getOccupancy(trafficIntensity, n);
    const busy = occ > 1 ? 1 : occ;
    const free = 1 - busy;
    const probOfWaiting = ErlangC(n, trafficIntensity);

    return Math.round(((probOfWaiting * averageHandleTime) / (n * free))*100)/100;
  }

  // The result is a unit in "Erlangs", and it
  // represents the ideal minimum number of agents in a perfect world where all
  // calls arrive immediately after an agent frees up.
  //
  function TrafficIntensity(callsPerPeriod, averageHandleTime) {
    return callsPerPeriod * averageHandleTime;
  }

  // Return probability that any given call waits
  //
  function ErlangC(n, mean) {
    // probability that n (# agents) occurs, given mean
    //
    const x = Poisson(n, mean);

    // probability that any number under n occurs, given mean
    //
    const cumul = PoissonCumul(n - 1, mean);

    // percentage of time that an agent is busy (free).  Note that n >= mean
    //
    const busy = getOccupancy(mean, n);
    const free = 1 - busy;

    const y = free * cumul;

    return x / (x + y);
  }

  function getOccupancy(mean, n) {
    return mean / n;
  }

  // This calculates ((TheMean**IdealSuccesses)*(e**-TheMean) / IdealSuccesses!),
  // which is the Poisson formula.
  //
  // The returned value is the probability that IdealSuccesses will occur,
  // given the average number of successes is TheMean.
  //
  // The 'e' term normalizes the result to be between 0 and 1 (that is, a true
  // probability).  It isn't strictly necessary,
  // but it helps when validating the function as we can eyeball it.  It may
  // also help to avoid some types of skew.
  //
  function Poisson(IdealSuccesses, TheMean)
  {
    if (IdealSuccesses <= 0) { 
      return 0;
    } else {
      const Numerator = Math.pow(TheMean, IdealSuccesses) * (Math.pow(Math.E, (TheMean * -1)));
      const Denominator = Factorial(IdealSuccesses);
      return Numerator / Denominator;
    }
  }

  function PoissonCumul(n, TheMean, soFar)
  {
    const thisVal = soFar ? soFar : 0;
    const withThis = n < 0 ? thisVal : thisVal + Poisson(n, TheMean);
    return n < 0 ? withThis : PoissonCumul(n - 1, TheMean, withThis);
  }

  function Factorial(Input)
  {
    if (Input == 0) {
      return 1;
    } else {
      return Input * Factorial(Input - 1);
    }
  }

  return {
    TrafficIntensity,
    AverageSpeedOfAnswer,
    ErlangC
  }

}();

export default erlangC;
