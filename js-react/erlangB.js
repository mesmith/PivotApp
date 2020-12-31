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
 */

// package queueing;

// import math.GammaFunction;
// import math.optimization.BisectionSearch;
// import math.optimization.RootFunction;

import GammaFunction from './GammaFunction.js';

/**
 * Functions for the Erlang-B model (M/M/n/n queue).
 * <p>
 * Exact routines are provided for computing the blocking probability (including
 * the scenario where the number of servers is non integer), the minimum number
 * of servers necessary to handle a certain load with a certain blocking
 * probability or the maximum load that a specified number of servers can handle
 * with a predetermined blocking probability.
 * <p>
 * Approximation algorithms are provided to estimate the blocking probability in
 * closed form, namely Rapp's approximation, which employs a parabola, and one
 * algorithm which approximates the Erlang loss formula in a continuos form.
 */
const erlangB = function() {

  /**
   * Computes the blocking probability of an Erlang-B queue with n trunks and
   * traffic intensity load.
   * 
   * @return The blocking probability pn, 0.0 <= pn <= 1.0.
   */
  const erlangB = function(n, load) {
    var pn = 1.0;
    for (var i = 1; i <= n; i++) {
      pn = computeRecursive(i, load, pn);
    }
    return pn;
  }

  const computeRecursive = function(n, load, pn_1) {
    return (load * pn_1) / (n + load * pn_1);
  }

  /**
   * Computes the blocking probability of an Erlang-B queue with n trunks and
   * traffic intensity load using the upper incomplete Gamma function.
   * <p>
   * <strong>n is not integer.</strong>
   * 
   * @param n The number of servers.
   * @param load The offered load.
   * @return The blocking probability pn, 0.0 <= pn <= 1.0
   * @see Jerzy Kubasik, Eq. 8 of <a href=
   *      "http://www.i-teletraffic.org/fileadmin/ITCBibDatabase/1985/kubasik852.pdf"
   *      >On some numerical methods for the computation of Erlang and Engset
   *      functions</a>
   */
  const erlangBNonInt = function(n, load) {
    if (load == 0.0) {
      return 0.0;
    }
    if (n == 0.0) {
      return 1.0;
    }
    const nInt = Math.floor(n);
    if (nInt == n) {
      return erlangB(nInt, load);
    }

    // first part of (8),  load^n / e^load
    const log1 = (n * Math.log(load) - load);
    const nPlus1 = n + 1.0;
    const tmp2 = (GammaFunction.regularizedGammaQ(nPlus1, load));
    if (tmp2 == 0.0) {
      return 1.0;
    }
    // log upper incomplete (n+1, load)
    const log2 = Math.log(tmp2) + GammaFunction.gammln(nPlus1);
    const res = Math.exp(log1 - log2); 

    return res;
  }

  /**
   * Computes the blocking probability of an Erlang-B queue with n trunks and
   * traffic intensity load.
   * <p>
   * This routine employs the approximation of the Erlang loss formula in a
   * continuos form. The algorithm uses the same recursive scheme as the one
   * dealing with an integer number of servers.
   * 
   * @param n The number of servers.
   * @param load The offered load.
   * @return The blocking probability pn, 0.0 <= pn <= 1.0
   * @see Eq. 4 and 5 of
   *      "Modeling of systems with overlfow multi-rate traffic".
   */
  const erlangBApprox = function(n, load) {
    const nInt = Math.floor(n);
    if (nInt === n) {
      return erlangB(nInt, load);
    }

    const s = n - nInt;

    const numerator = (2.0 - s) * load + load * load;
    const denominator = s + 2 * load + load * load;
    const tmp = numerator / denominator; // eq. 5

    // eq. 4
    var pn = tmp;
    for (var i = 1; i <= nInt; i++) {
      pn = computeRecursive(i + s, load, pn);
    }
    return pn;
  }

  /**
   * Computes the blocking probability of an Erlang-B queue with n trunks and
   * traffic intensity load in closed form using Rapp approximation (which
   * employs a parabola).
   * <p>
   * This routine employs the approximates of the Erlang loss formula by a
   * parabola using Rapp's algorithm:
   * <p>
   * E(n, load) = c<sub>0</sub> - c<sub>1</sub> n + c<sub>2</sub>
   * n<sup>2</sup> where <lu>
   * <li>c<sub>0</sub> = 1
   * <li>c<sub>1</sub> = (load+2) + ((1+load)<sup>2</sup> + load)
   * <li>c<sub>2</sub> = 1 / ((1 + load) * ((1+load)<sup>2</sup> + load))
   * </lu>
   * 
   * @param n The number of servers.
   * @param load The offered load.
   * @return The blocking probability pn, 0.0 <= pn <= 1.0
   */
  const rappApprox = function(n, load) {
    const c0 = 1.0;

    const tmp = (1.0 + load) * (1.0 + load);
    const c1 = -((2.0 + load) / (tmp + load));
    const c2 = 1.0 / ((1.0 + load) * (tmp + load));
    const res = c0 + (c1 * n) + (c2 * (n * n));
    return res;
  }

  /**
   * Finds the minimum number of servers which are capable of serving the
   * offered traffic with the given grade of service.
   * 
   * @param load The offered load.
   * @param blockingProb The maximum desired blocking probability.
   * @return The minimum number of servers necessary
   */
  const findMinServers = function(load, blockingProb) {
    // since the Erlang-B formula is convex for n > 1, we might use
    // the bisection (binary search) method. However it is more convenient
    // to apply the recursive formula

    if ((blockingProb == 1.0) || (load == 0.0)) {
      return 0;
    }

    var pn = 1.0;
    var n = 0;
    while (pn > blockingProb) {
      n++;
      pn = computeRecursive(n, load, pn);
    }
    return n;
  }

  // public static void main(String[] args) {
    // double n = 2.3;
    // double load = 2.1;
    // System.out.println(erlangBApprox(n, load));
    // System.out.println(erlangBNonInt(n, load));
    // System.out.println(rappApprox(n, load));

    // n = 181.45880536972368;
    // load = 191.1882233542687;
    // double res = erlangBNonInt(n, load);
    // System.out.println(res);
  // }

  return {
    erlangB,
    erlangBApprox,
    rappApprox,
    erlangBNonInt
  };
}();

export default erlangB;
