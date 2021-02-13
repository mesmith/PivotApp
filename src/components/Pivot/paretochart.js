import React from 'react';
import pareto from './pareto.js';
import constants from './constants.js';
import metadata from './metadata.js';
import utils from './utils.js';

// Implement the React Pareto chart
//
class ParetoChart extends React.Component {

  // Called when ParetoChart is created.  Do D3 creation routines that
  // are data-independent
  //
  componentDidMount(){
    const parent = this.node;
    const { d3config } = this.props;

    pareto.create(parent, d3config);

    // This is needed in order to force componentDidUpdate to fire.
    //
    // Before I added this, the following sequence:
    //   Start, set to Pareto, change dataset, Previous View
    // would cause componentDidUpdate not to fire.
    //
    this.setState({ current: this.props.current });
  }

  // Called after ParetoChart's props or state changes.  If 'show' is true,
  // redraw the chart.
  //
  componentDidUpdate(){
    const parent = this.node;
    const { show, loading, value, d3top, d3config } = this.props;

    if (show && value.axes.animate=="None") {
      const paretoData = this.decorate(value.drawingData,
        value.axes.yAxis, value.datapointCol);

      pareto.redraw(parent, paretoData,
          value.tooltipPivots, value.datapointCol, value.axes, d3config,
          loading);
    } else {
      pareto.clear(parent, d3config);
    }
  }

  // Decorate the data by first sorting it (large to small) by Y axis
  // values, then by adding the cumulative amounts and percentages of
  // the total value.  This is the "Pareto ordering".
  //
  decorate(data, yAxis, datapointCol) {
    const datapointAlias = metadata.getAlias(datapointCol);
    const cumAmountField = constants.cumulative.amount;
    const cumPercentField = constants.cumulative.percent;
    const cumTotalField = constants.cumulative.total;

    // Filter out the data that doesn't have datapoint values.
    // This can happen when transitioning between datapoints (and
    // fetching new data).
    //
    const withDatapoints = data.filter(i => i.hasOwnProperty(datapointAlias));

    const amounts = withDatapoints.reduce((i, j) => {
      const value = utils.safeVal(j, yAxis);
      const totalAmount = i.totalAmount + value;
      const minValue = value < i.minValue ? value : i.minValue;
      return {totalAmount, minValue};
    }, {totalAmount: 0, minValue: 0});

    const scaledTotalAmount =
        amounts.totalAmount + (withDatapoints.length * -amounts.minValue);

    const decorated = withDatapoints.sort((i, j) => {
      const iValue = utils.safeVal(i, yAxis);
      const jValue = utils.safeVal(j, yAxis);
      return jValue - iValue;
    }).reduce((i, j) => {
      const value = utils.safeVal(j, yAxis);

      // Notice how the value is scaled by minValue.  If minValue
      // is negative, we will adjust the scale to be from zero.
      //
      const cum = i.cum + (value - amounts.minValue);

      const cums = {
        [cumAmountField]: cum,
        [cumPercentField]: cum/scaledTotalAmount,
        [cumTotalField]: scaledTotalAmount
      };
      const record = {...j, ...cums};
      const output = i.output.concat([record]);
      return {output, cum};
    }, {output: [], cum: 0});

    return decorated.output;
  }

  // Called before ParetoChart is destroyed
  //
  componentWillUnmount(){
    pareto.destroy();
  }

  render(){
    const showClass = this.props.show ? 'chartShow' : 'chartNone';
    return (
      <g className={"pareto " + showClass} ref={node => this.node = node} />
    )
  }
}

export default ParetoChart;
