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
// package math;

// import static java.lang.Math.abs;
// import static java.lang.Math.log;
// import static java.lang.Math.exp;

const GammaFunction = function() {

  /** Maximum allowed number of iterations. */
  const ITMAX = 100;

  /** Relative accuracy. */
  const EPS = 3.0e-7;

  /** Number near the smallest representable. */
  // const FPMIN = Double.MIN_VALUE;
  const FPMIN = -Number.MAX_VALUE;  // closest javascript comes to negative infinity

  /**
   * Computes the value of ln(gamma(xx)) for xx >0.
   */
  const gammln = function(xx) {
    var x, y, tmp, ser;
    x = y = tmp = ser = 0.0;

    const cof = [ 76.18009172947146, -86.50532032941677,
      24.01409824083091, -1.231739572450155, 0.1208650973866179e-2,
      -0.5395239384953e-5 ];
    y = x = xx;
    tmp = x + 5.5;
    tmp -= (x + 0.5) * log(tmp);
    ser = 1.000000000190015;
    for (var j = 0; j <= 5; j++) {
      ser += cof[j] / ++y;
    }

    // return -tmp + log(2.5066282746310005 * ser / x);
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  /**
   * Computes &Gamma;(xx), where &Gamma; is the complete Gamma() function.
   * 
   * @param xx A number.
   * @return &Gamma;(xx).
   */
  const gamma = function(xx) {
    return Math.exp(gammln(xx));
  }

  /**
   * Computes the lower incomplete gamma function, &gamma;(a,x)= integral from
   * zero to x of (exp(-t)t^(a-1))dt.
   * <p>
   * This is the same as Igamma(a, x, lower=TRUE) in the zipfR in R.
   * 
   * @param a The parameter of the integral
   * @param x The upper bound for the interval of integration
   * @return The lower incomplete gamma function, &gamma;(s,x).
   */
  const lowerIncomplete = function(a, x) {
    return regularizedGammaP(a, x) * gamma(a);
  }

  /**
   * Computes the upper incomplete gamma function, &gamma;(s,x)= integral from
   * x to infinity of (exp(-t)t^(s-1))dt.
   * <p>
   * This is the same as Igamma(a, x, lower=FALSE) in the zipfR in R.
   * 
   * @param a The parameter of the integral
   * @param x The lower bound for the interval of integration
   * @return The upper incomplete gamma function, &gamma;(s,x).
   */
  const upperIncomplete = function(a, x) {
    return regularizedGammaQ(a, x) * gamma(a);
  }

  /**
   * Returns the upper incomplete <strong>regularised</strong> gamma function
   * Q(a, x) = 1 − P(a, x).
   * <p>
   * This is the same as Rgamma(a, x, lower=FALSE) in the zipfR in R.
   * 
   * @see <a
   *      href="http://finzi.psych.upenn.edu/R/library/zipfR/html/beta_gamma.html">Incomplete
   *      Beta and Gamma Functions (zipfR)</a>
   */
  const regularizedGammaQ = function(a, x) {
    if (a <= 0.0) {
      console.log("Invalid arguments in routine gammq");
      return Infinity;
    }
    return 1.0 - regularizedGammaP(a, x);
  }

  /**
   * Returns the lower incomplete <strong>regularised</strong> gamma function
   * P(a, x)= &gamma;(a,x)/&Gamma;(a).
   * <p>
   * P(a, x) is the cumulative distribution function for Gamma random
   * variables with shape parameter <i>a</i> and scale parameter 1.
   * <p>
   * This is the same as Rgamma(a, x, lower=TRUE) in the zipfR in R.
   * 
   * @see <a
   *      href="http://finzi.psych.upenn.edu/R/library/zipfR/html/beta_gamma.html">Incomplete
   *      Beta and Gamma Functions (zipfR)</a>
   * @see <a
   *      href="http://en.wikipedia.org/wiki/Incomplete_gamma_function#Regularized_Gamma_functions_and_Poisson_random_variables">Regularized
   *      Gamma functions and Poisson random variables</a>
   */
  const regularizedGammaP = function(a, x) {
    if (a <= 0.0) {
      console.log("Invalid arguments in routine gammp");
      return Infinity;
    }
    if (x < (a + 1.0)) { // Use the series representation.
      const gamser = gser(a, x);
      return gamser;
    } else { // Use the continued fraction representation
      const gammcf = gcf(a, x);
      return 1.0 - gammcf; // and take its complement.
    }
  }

  /**
   * Returns the incomplete gamma function P(a, x) evaluated by its series
   * representation.
   */
  const gser = function(a, x) {
    // Returns the incomplete gamma function P(a, x) evaluated by its series
    // representation as gamser.
    // Also returns ln gamma(a) as gln.
    // double sum, del, ap;
    const gln = gammln(a);
    if (x <= 0.0) {
      if (x < 0.0) {
        console.log("x < 0 in routine gser");
        return Infinity;
      }
      return 0.0;
    } else {
      var gamser = 0.0;
      var ap = a;
      var del, sum;
      del = sum = 1.0 / a;
      for (var n = 1; n <= ITMAX; n++) {
        ++ap;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * EPS) {
          gamser = sum * Math.exp(-x + a * Math.log(x) - gln);
          return gamser;
        }
      }
      console.log("a too large, ITMAX too small in routine gser");
      return Infinity;
    }
  }

  /**
   * Computes the incomplete gamma function Q(a, x) = 1 - P(a,x) = 1 -
   * integral from zero to x of (exp(-t)t^(a-1))dt evaluated by its continued
   * fraction representation.
   */
  const gcf = function(a, x) {
    var an, del;
    var i;
    var b = x + 1.0 - a; // Set up for evaluating continued fraction
    // by modified Lentz’s method (§5.2) with b0 = 0.
    var c = 1.0 / FPMIN;
    var d = 1.0 / b;
    var h = d;
    for (i = 1; i <= ITMAX; i++) { // Iterate to convergence.
      an = -i * (i - a);
      b += 2.0;
      d = an * d + b;
      if (Math.abs(d) < FPMIN) {
        d = FPMIN;
      }
      c = b + an / c;
      if (Math.abs(c) < FPMIN) {
        c = FPMIN;
      }
      d = 1.0 / d;
      del = d * c;
      h *= del;
      if (Math.abs(del - 1.0) < EPS)
        break;
    }
    if (i > ITMAX) {
      console.log("a too large, ITMAX too small in gcf");
      return Infinity;
    }
    // Put factors in front.
    const gln = gammln(a);
    const gammcf = Math.exp(-x + a * Math.log(x) - gln) * h;
    return gammcf; // imcomplete gamma function Q(a,x)
  }

  // public static void main(String[] args) {
    // System.out.println(gamma(2.98));
    // double a = 2.98;
    // double x = 1.3;

    // Documentation at
    // http://zipfr.r-forge.r-project.org/materials/zipfR_0.6-5.pdf
    // Sec. beta_gamma
    // > Igamma(a,x, lower=T)
    // System.out.println("lower incomplete " + lowerIncomplete(a, x));
    // > Igamma(a,x, lower=F)
    // System.out.println("upper incomplete " + upperIncomplete(a, x));

    // > Rgamma(a,x, lower=T)
    // System.out.println("reg. lower " + regularizedGammaP(a, x));
    // > Rgamma(a,x, lower=F)
    // System.out.println("reg. upper " + regularizedGammaQ(a, x));
  // }

  return {
    regularizedGammaP,
    regularizedGammaQ,
    gamma,
    gammln,
    lowerIncomplete,
    upperIncomplete
  }
}();
