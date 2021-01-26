import React from 'react';
import line from './line.js';
import forcelabel from './forcelabel.js';
import animation from './time_animation.js';
import controls from './controls.js';

// Implement the React line or bubble chart
//
class LineChart extends React.Component {

  // Called when LineChart is created.  Do D3 creation routines that
  // are data-independent
  //
  componentDidMount(){
    const parent = this.node;
    const { d3config, d3top, value } = this.props;
    const newConfig = controls.getConfigFromControls(value.axes, d3config);

    // When creating, add the force label element
    // to the <LineChart> state
    //
    line.create(parent, newConfig);
    const forceLabels = forcelabel.create(d3top);
    animation.create(parent, newConfig);
    this.setState({forceLabels: forceLabels});
  }

  // Called after LineChart's props or state changes.  If 'show' is true,
  // redraw the chart.
  //
  componentDidUpdate(){
    const parent = this.node;
    const { show, loading, value, d3top, d3config } = this.props;
    const forceLabels = this.state.forceLabels;
    const newConfig = controls.getConfigFromControls(value.axes, d3config);

    if( show ){
      switch( value.axes.graphtype ){
        case 'bubble':
          if (value.axes.animate=="None") {
            animation.clear(parent, value.axes, newConfig);
            line.redrawBubble(parent, forceLabels, 
                value.drawingData, false, value.tooltipPivots, 
                value.datapointCol, value.axes, newConfig, loading);
          } else {
            line.clear(parent, newConfig);
            line.clearBubble(parent, newConfig);
            forcelabel.clear(forceLabels, value.axes, newConfig);

            animation.redraw(parent, d3top, value.drawingData, value.tooltipPivots,
                value.datapointCol, value.axes, newConfig);
          }
          break;
        case 'line':
          if( value.axes.animate=="None"){
            animation.clear(parent, value.axes, newConfig);
            line.redraw(parent, forceLabels, value.drawingData, 
                value.tooltipPivots, value.datapointCol, value.axes, newConfig,
                loading);
          } else {
            line.clear(parent, newConfig);
            line.clearBubble(parent, newConfig);
          }
          break;
      }
    } else {
      line.clear(parent, newConfig);
      line.clearBubble(parent, newConfig);
      forcelabel.clear(forceLabels, value.axes, newConfig);
      animation.clear(parent, value.axes, newConfig);
    }
  }

  // Called before LineChart is destroyed
  //
  componentWillUnMount(){
    line.destroy();
  }

  render(){
    const showClass = this.props.show ? 'chartShow' : 'chartNone';
    return (
      <g className={"bubblegraph " + showClass} ref={node => this.node = node} />
    )
  }
}

export default LineChart;
