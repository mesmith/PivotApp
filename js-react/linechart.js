import React from 'react';
import line from './line.js';
import forcelabel from './forcelabel.js';
import animation from './time_animation.js';

// Implement the React line or bubble chart
//
class LineChart extends React.Component {

  // Called when LineChart is created.  Do D3 creation routines that
  // are data-independent
  //
  componentDidMount(){
    const parent = this.node;
    const d3top = this.props.d3top;

    // When creating, add the force label element
    // to the <LineChart> state
    //
    line.create(parent, this.props.d3config);
    const forceLabels = forcelabel.create(d3top);
    animation.create(parent, this.props.d3config);
    this.setState({forceLabels: forceLabels});
  }

  // Called after LineChart's props or state changes.  If 'show' is true,
  // redraw the chart.
  //
  componentDidUpdate(){
    const parent = this.node;
    const { show, loading, value, d3top, d3config } = this.props;
    const forceLabels = this.state.forceLabels;

    if( show ){
      switch( value.axes.graphtype ){
        case 'bubble':
          if( value.axes.animate=="None"){
            animation.clear(parent, value.axes, d3config);
            line.redrawBubble(parent, forceLabels, 
                value.drawingData, false, value.tooltipPivots, 
                value.datapointCol, value.axes, d3config, loading);
          } else {
            line.clear(parent, d3config);
            line.clearBubble(parent, d3config);
            forcelabel.clear(forceLabels, value.axes, d3config);

            animation.redraw(parent, d3top, value.drawingData, value.tooltipPivots,
                value.datapointCol, value.axes, d3config);
          }
          break;
        case 'line':
          if( value.axes.animate=="None"){
            animation.clear(parent, value.axes, d3config);
            line.redraw(parent, forceLabels, value.drawingData, 
                value.tooltipPivots, value.datapointCol, value.axes, d3config,
                loading);
          } else {
            line.clear(parent, d3config);
            line.clearBubble(parent, d3config);
          }
          break;
      }
    } else {
      line.clear(parent, d3config);
      line.clearBubble(parent, d3config);
      forcelabel.clear(forceLabels, value.axes, d3config);
      animation.clear(parent, value.axes, d3config);
    }
  }

  // Called before LineChart is destroyed
  //
  componentWillUnMount(){
    line.destroy();
  }

  render(){
    return (
      <g className="bubblegraph" ref={node => this.node = node}
          style={this.props.show? {display: "inline"}: {display: "none"}} />
    )
  }
}

export default LineChart;
