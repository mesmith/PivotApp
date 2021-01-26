import React from 'react';
import force from './force.js';

// ReactJS component that contains the force graph
//
class ForceChart extends React.Component {

  // Called when the ForceChart is created.  Do D3 creation routines that
  // are data-independent
  //
  componentDidMount(){
    const parent = this.node;
    const v = this.props.value;
    const forceLayout = 
        force.create(parent, v.drawingData, v.tooltipPivots, 
            v.datapointCol, this.props.d3config);

    // We need to retain the force layout state for the next redraw;
    // that's the only way we can stop a previous force layout.
    //
    this.setState({
      forceLayout: forceLayout,
    });
    if( this.props.show ){
      force.redraw(v.drawingData, v.tooltipPivots, v.datapointCol, 
          forceLayout,
          /* firstDraw */ true, this.props.d3config);
    }
  }

  // Called after ForceChart's props or state changes.  If 'show' is true,
  // redraw the chart.
  //
  componentDidUpdate(){
    if( this.props.show ){
      const v = this.props.value;
      force.redraw(v.drawingData, v.tooltipPivots, v.datapointCol,
          this.state.forceLayout, /* firstDraw */ false, this.props.d3config);
    }
  }

  // Called before ForceChart is destroyed
  //
  componentWillUnmount(){
    force.destroy();
  }

  render(){
    const showClass = this.props.show ? 'chartShow' : 'chartNone';
    return (
      <g className={"forcegraph " + showClass} ref={node => this.node = node} />
    );
  }
}

export default ForceChart;
