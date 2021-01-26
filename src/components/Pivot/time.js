// Time calculation functions
//
import {timeMonth} from 'd3-time';
import {timeFormat, timeParse} from 'd3-time-format';

import utils from './utils.js';

const time = function(){

  // This function returns the index value from 'row' from the given date 
  // 'column'.  This particular one is used if the column is a date field, 
  // and if we wish to bin the date by month.
  //
  // Used in the metadata attribute 'binner'.
  //
  function byMonth(row, column){
    return dateToMonth(row[column]);
  }

  // Convert (m)m/(d)d/yyyy to a sortable, non-irregular month rep
  //
  function dateToMonth(idate){
    return +inputToMonthDate(idate);  // convert Date to ms epoch
  }

  // Convert the input date format (m)m/(d)d/yyyy to a Date
  // representing the entire month
  //
  function inputToMonthDate(idate){
    return timeMonth(inputToDate(idate));
  }

  // Convert the input date format (m)m/(d)d/yyyy (and other allowable ones)
  // to a Date
  //
  function inputToDate(idate){
    const formats = [
      '%m/%d/%Y',
      '%m/%d/%Y %H:%M:%S',
      '%m/%d/%Y %H:%M:%SZ',
      '%m/%d/%Y %H:%M %p'
    ];
    const format = formats.find(i => {
      return timeParse(i)(idate) !== null;
    });
    // return format ? timeParse(format)(idate) : null;
    return format ? timeParse(format)(idate) : new Date(idate);
  }

  // From milliseconds to human readable month of the form 'Mon YYYY'
  //
  function msecToHumanMonth(msec){
    const odate = new Date(msec);
    return timeFormat('%b %Y')(odate);
  }
  
  // Convert the human month of the form 'Mon YYYY' to
  // milliseconds since epoch
  //
  function monthToMsec(month){
    // return +d3.time.format('%b %Y').parse(month);
    return +timeParse('%b %Y')(month);
  }

  // Format milliseconds into human readable date
  //
  function msecToHuman(msec){
    const odate = new Date(msec);
    return timeFormat('%b %d %Y')(odate);
  }

  function msecToDateTime(msec){
    const odate = new Date(msec);
    return timeFormat('%b %d, %Y %H:%M:%S')(odate);
  }


  // Round milliseconds into its month msec value
  //
  function msecToMonth(msec){
    return monthToMsec(msecToHumanMonth(msec));
  }

  // Convert date in ISO format (YYYY-MM-DDTHH:MM:SS.MMMZ)
  // into date string of the form MM/DD/YYYY
  //
  function isoToDate(isoDate) {
    const dt = isoDate ? new Date(isoDate) : null;
    if (!utils.isDate(dt)) {
      return isoDate;
    } else {
      const mon = dt ? dt.getMonth() + 1 : null;
      const day = dt ? dt.getDate() : null;
      const year = dt ? dt.getFullYear() : null;
      const res = dt ? `${mon}/${day}/${year}` : isoDate;
      return res;
    }
  }

  function isoToMS(isoDate) {
    const dt = isoDate ? new Date(isoDate) : null;
    return (dt === 'Invalid Date' || dt === null) ? isoDate : +dt;
  }

  return {
    byMonth,
    msecToHumanMonth,
    inputToDate,
    dateToMonth,
    msecToHuman,
    msecToMonth,
    msecToDateTime,
    isoToDate,
    isoToMS
  }
}();

export default time;
