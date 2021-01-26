// Map drawing functions.  These are d3 routines.

import map from './map.js';
import React from 'react';

// ReactJS component that contains the d3 map
//
class MapChart extends React.Component {

  // Called when the MapChart is created.  Do D3 creation routines that
  // are data-independent
  //
  componentDidMount(){
    const el = this.node;
    map.create(el);
    if( this.props.show ){
      const v = this.props.value;
      map.redraw(el, v.drawingData, v.tooltipPivots,
          v.datapointCol, v.axes, this.props.d3config);
    }
  }

  // Called after MapChart's props or state changes.  If 'show' is true,
  // redraw the map.
  //
  componentDidUpdate(){
    if( this.props.show ){
      const v = this.props.value;
      const el = this.node;
      map.redraw(el, v.drawingData, v.tooltipPivots,
          v.datapointCol, v.axes, this.props.d3config);
    }
  }

  // Called before MapChart is destroyed
  //
  componentWillUnmount(){
    map.destroy();
  }

  render(){
    const showClass = this.props.show ? 'chartShow' : 'chartNone';
    return (
      <g className={"map " + showClass} ref={node => this.node = node} />
    );
  }
}

export default MapChart;
