/*
 * Copyright (C) 2013 Michele Mazzucco
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Original release: Jun 16, 2013
 * New javascript release in April, 2018, derived from Michele's ErlangA.java,
 * with bugfixes from Mark Smith.
 */
import erlangB from './erlangB.js';

const erlangA = function() {
  
  const MAX_ITERATIONS = Math.pow(10, 6);

  const EPSILON = Math.pow(10, -15);

  // n: # of agents (servers)
  // lam: arrival rate
  // mu: average call handling time (service rate)
  // theta: abandonment rate
  //
  const ErlangA = function (n, lam, mu, theta) {
    if (n < 1) {
      console.log("Need at least one server!");
      return Infinity;
    }
    if ((lam < 0.0) || (mu < 0.0)) {
      console.log("Load parameters must be >= 0");
      return Infinity;
    }
    if (theta <= 0.0) {
      // if theta = 0 it becomes a M/M/n queue
      console.log("The abandonment rate must be > 0");
      return Infinity;
    }

    // The traffic intensity (or "offered load"), and the offered load
    // per agent (rho).
    //
    // In the original Java, "rho" was used for both ti and rho, but
    // that gives incorrect results (unsurprisingly, since they are
    // clearly different values).
    //
    const ti = lam / mu;
    const rho = ti / n;

    const x = n * mu / theta;
    const y = lam / theta;

    const axy = getAXY(x, y);
    const pn = getPN(n, ti, axy);
    const p = computeProbabilitiesP0(n, lam, mu, theta, pn, ti);
    const jobs = computeJobsDistribution(p);

    return { p, pn, jobs, rho, ti, axy };
  }

  // See formula 3.5, page 8, of original paper
  //
  const getAXY = function(x, y) {
    var res = 1.0;
    var tmp = 1.0;
    var j;

    for (j = 1; j <= MAX_ITERATIONS; j++) {
      tmp *= y / (x + j);
      res += tmp;
      if (tmp < EPSILON) {
        break;
      }
    }
    if (j > MAX_ITERATIONS) {
      console.log("axy did not converge, found res=" + res);
      return Infinity;
    }
    
    return res;
  }

  /**
   * Computes the probability that all servers are busy and no jobs are
   * waiting, i.e., the probability that there are exactly n jobs in the
   * system.
   */
  const getPN = function(n, ti, axy) {
    const erlangBprob = erlangB.erlangB(n, ti);
    const tmp = 1.0 + erlangBprob * (axy - 1.0);

    return erlangBprob / tmp;
  }

  /**
   * Computes the steady-state probability distribution starting from p0.
   */
  const computeProbabilitiesP0 = function(n, lam, mu, theta, pn, rho) {
    var list = []; // new DoubleArrayList(n);

    const p0 = getProbabilityEmpty(n, pn, rho);
    list.push(p0);

    for (var i = 1; i <= n; i++) { // compute p1...pn
      var tmp = p0;

      for (var j = 1; j <= i; j++) {
        tmp *= rho / j; // compute rho^j / j!
      }

      // p0 * rho^j / j!
      list.push(tmp); // add p1...pn to the list
    }

    // double pnCheck = list.get(n); // pn is computed by itself, check
    // assert (pnCheck - pn <= 10E-6);
    var pnCheck = list[n]; // pn is computed by itself, check
    if (pnCheck - pn > 10E-6) {
      console.log('pnCheck does not match pn!');
      return [];
    }

    // compute p_n+1... stop when the error is smaller than 10^-15
    var pj = 0.0;
    var j = n;

    var tmp = p0; // compute p0 * rho^n / n!
    for (var i = 1; i <= n; i++) {
      tmp *= rho / i;
    }
    do { // prod k=n+1...j (lam / (n*mu + (k-n)*theta) * tmp
      pj = tmp;
      j++;
      for (var k = n + 1; k <= j; k++) {
        pj *= lam / (n * mu + (k - n) * theta);
      }
      list.push(pj);
    } while (pj > EPSILON); // stop when prob. j is about 0

    return list;
  }

  /**
   * Computes the probability that the system is empty.
   */
  const getProbabilityEmpty = function(n, pn, rho) {
    var tmp = 1.0;
    for (var i = 1; i <= n; i++) {
      tmp *= i / rho;
    }
    return pn * tmp;
  }

  /**
   * Computes the steady-state jobs distribution.
   */
  const computeJobsDistribution = function(p) {
    // double[] res = new double[this.p.length];
    var res = [];

    for (var i = 0; i < p.length; i++) {
      // res[i] = i * this.p[i];
      res.push(i * p[i]);
    }
    return res;
  }

  /**
   * Gets the steady-state probability distribution.
   * <p>
   * The sum should be <i>approximately</i> 1 (apart from rounding errors).
   * p[i] is the probability of being in state <i>i</i>
   */
  const getSteadyStateProbabilities = function(p) {
    return p;
  }

  /**
   * Returns the steady-state jobs distribution.
   */
  const getSteadyStateJobsDistribution = function(jobs) {
    return jobs;
  }

  /**
   * Computes the probability that a job will have to wait, P(W>0).
   */
  const waitingProbability = function(axy, pn) {
    return axy * pn;
  }

  /**
   * Computes the abandonment probability of delayed jobs, P(Ab|W>0).
   */
  const abandonProbIfDelayed = function(rho, axy) {
    return (1.0 / (rho * axy)) + 1.0 - (1.0 / rho);
  }

  /**
   * Computes the average waiting time of delayed jobs, E[W|W>0].
   */
  const meanWaitingIfDelayed = function(theta, rho, axy) {
    return 1.0 / theta
        * (1.0 - (1.0 / rho) + 1.0 / (rho * axy));
  }

  /**
   * Computes the probability that a job will abandon the system, P(Ab).
   */
  const abandonmentProbability = function(rho, axy, pn) {
    return abandonProbIfDelayed(rho, axy) * waitingProbability(axy, pn);
  }

  /**
   * Computes the average waiting time, E[W].
   * <p>
   * This value is computed as P(Ab) / &theta;. The same result can be found
   * as E[W|W>0] * P(W>0).
   */
  const meanWaitingTime = function(rho, axy, pn, theta) {
    // we have P(ab) = theta * E[W]
    return abandonmentProbability(rho, axy, pn) / theta;
  }

  /**
   * Computes the steady-state average queue length, E[Q].
   */
  const avgQueueLen = function(lam, rho, axy, pn, theta) {
    return lam * meanWaitingTime(rho, axy, pn, theta);
  }

  /**
   * Computes the steady-state average number of jobs inside the system
   * (either queueing or being served), E[L].
   */
  const getL = function(jobs) {
    var sum = 0.0;
    for (var i = 1; i < jobs.length; i++) {
      sum += jobs[i];
    }
    return sum;
  }

  /**
   * Computes the system throughput, E[T].
   */
  const getThroughput = function(n, mu, lam, rho, axy, pn) {
    return Math.min(n * mu, lam * (1.0 - abandonmentProbability(rho, axy, pn)));
  }

  /**
   * Computes the probability of being served of a job which, on arrival,
   * finds all servers busy and <i>i</i> jobs in the queue, i.e., <i>n+i</i>
   * jobs in the system.
   * 
   * @param i Number of jobs in the queue.
   * @return The probability of being served.
   * @throws IllegalArgumentException If i < 0.
   */
  const probService = function(i, n, mu, theta) {
    if (i < 0) {
      console.log('probService: i must be >= 0');
      return Infinity;
    }
    const tmp = n * mu;
    return tmp / (tmp + theta * (i + 1));
  }

  /**
   * Computes the probability that a job which, on arrival, finds all
   * servers busy and <i>i</i> jobs in the queue, i.e., <i>n+i</i> jobs in the
   * system, abandons the system.
   * 
   * @param i Number of jobs in the queue.
   * @return The probability of abandonment.
   * @throws IllegalArgumentException If i < 0.
   */
  const probAbandonment = function(i, n, mu, theta) {
    if (i < 0) {
      console.log('proAbandonment: i must be >= 0');
      return Infinity;
    }
    return 1.0 - probService(i, n, mu, theta);
  }

  /**
   * @param args
   * @throws Exception
   */
  // public static void main(String[] args) throws Exception {
    // int n = 20;
    // double lam = 19.0;
    // double mu = 1;
    // double theta = 0.000001;
    // ErlangA er = new ErlangA(n, lam, mu, theta);

    // System.out.printf("P(W>0) %.10f\n", er.waitingProbability());
    // double[] p = er.getSteadyStateProbabilities();
    // for (int i = 0; i < p.length; i++) {
    // System.out.printf("%d %.10f\n", i, p[i]);
    // }
    // System.out.printf("P(Ab) %.10f\n", er.abandonmentProbability());
    // System.out.printf("E[W] %.10f\n", er.meanWaitingTime());
    // System.out.printf("E[W|W>0] %.10f\n", er.meanWaitingIfDelayed());
    // System.out.printf("E[Q] %.10f\n", er.avgQueueLen());
    // System.out.printf("E[L] %.10f\n", er.getL());
    // System.out.printf("Throughput %.10f\n", er.getThroughput());
  // }

  return {
    ErlangA,
    waitingProbability,
    abandonProbIfDelayed,
    abandonmentProbability,
    waitingProbability,
    meanWaitingTime,
    meanWaitingIfDelayed,
    avgQueueLen,
    getPN,
    getL,
    getThroughput
  };
}();

export default erlangA;
