// Turning off eslint warnings:
/* global d3 */
//
import React from 'react';

import ForceChart from './forcechart.js';
import Facets from './facetchart.js';
import LineChart from './linechart.js';
import ParetoChart from './paretochart.js';
import MapChart from './mapchart.js';
import SummaryChart from './summary.js';
import WhatIfChart from './whatif.js';
import ModelChart from './modelchart.js';
import RadioGroup from './radio.js';
import Select from './select.js';
import Button from './button.js';

import metadata from './metadata.js';
import config from './config.js';

const d3top = 'pivot-graph';     // class of dom element where we do D3

// This initializes the D3 dom container.  The React <*Chart> components
// will draw D3 DOM into the container.
//
function initD3(){
  d3.select('.' + d3top)
    .attr("pointer-events", "all");  // Make pointer events work
                                     // (used in force graph)
}

class PivotContainer extends React.Component {
  constructor(props){
    super(props);
  }

  componentDidMount(){
    initD3();
  }

  render(){
    const { d3config } = config;
    const {
      loading, 
      value,
      current, history,
      facet, controls,
      summaryData, loadComparisonData,
    } = this.props;

    if (!value || !value.axes) {
      return null;
    }

    const animateVal = value.axes.animate;
    const graphtypeVal = value.axes.graphtype;

    const anyPrev = current > 0;
    const historyLast = Array.isArray(history) ? history.length - 1 : -1;
    const anyNext = current < historyLast;
    const datasetMonths = metadata.getDatasetMonths();
    const disabledMap = metadata.getDatasetDisabled().reduce((i, j) => {
      return {...i, ...{[j]: true}};
    }, {});
    const model = metadata.getDatasetModel();
    const hasAnimation = process.env.CUSTOMER === 'master';
    const width = d3config.WIDTH + d3config.MARGINS.left + d3config.MARGINS.right;
    const ypad = 20;  // not sure why we need this...maybe padding?
    const height = d3config.HEIGHT + d3config.MARGINS.bottom + d3config.MARGINS.top +
        ypad;
    const aspect = `0 0 ${width} ${height}`;

    return (
      <div className={"pivot-all-container pivot-div"}>
        <div className={"pivot-app-container pivot-div"}>

          <div className="pivot-lhs">
            <div className={"control pivot-div pivot-graph-container"}>
              <svg className="pivot-graph"
                  preserveAspectRatio="xMinYMin meet"
                  viewBox={aspect}>
                <MapChart
                    d3top={d3top}
                    d3config={d3config}
                    value={value}
                    show={graphtypeVal==="map" && animateVal==="None"}/>
                <ForceChart
                    d3top={d3top}
                    d3config={d3config}
                    value={value}
                    show={(graphtypeVal==="force" || graphtypeVal==="forceStatus") &&
                        animateVal==="None"}/>
                <LineChart
                    d3top={d3top}
                    d3config={d3config}
                    value={value}
                    loading={loading}
                    show={(graphtypeVal==="line" || graphtypeVal==="bubble")}/>
                <ParetoChart
                    d3top={d3top}
                    d3config={d3config}
                    value={value}
                    loading={loading}
                    show={(graphtypeVal==="pareto")}/>
              </svg>
            </div>
            <div className="control-container-form">
              <div className={"control-container pivot-div"}>
                <RadioGroup value={controls.graphtype} />
                { !disabledMap.hasOwnProperty('animate') && hasAnimation &&
                  ( <RadioGroup value={controls.animate} /> )
                }
                <div className={"control select-1 pivot-div"}>
                  <Select value={controls.datapoint} />
                  <Select value={controls.xAxis} />
                  <Select value={controls.yAxis} />
                </div>
                <div className={"control select-2 pivot-div"}>
                  <Select value={controls.radiusAxis} />
                  <Select value={controls.colorAxis} />
                  <div className={"control view-control pivot-div"}>
                    <Button value="Undo" label="Previous View" show={anyPrev}/>
                    <Button value="Redo" label="Next View" show={anyNext}/>
                  </div>
                </div>
              </div>
            </div>
          </div>

        { model==='callCenter' && (
          <div className={"pivot-rhs facet-container"}>
            <div className={"summaries pivot-div"}>
              <Facets value={facet}/>
            </div>
            <div className={"summaries pivot-div"}>
              <SummaryChart show={true} data={summaryData} />
              <ModelChart show={true} data={summaryData} months={datasetMonths}
                  loadComparisonData={loadComparisonData} />
              <WhatIfChart show={true} value={value} />
            </div>
          </div>
        )}
        { model!=='callCenter' && (
          <div className={"pivot-rhs facet-container pivot-div"}>
            <div className={"summaries pivot-div"}>
              <Facets value={facet}/>
            </div>
          </div>
        )}
        </div>
      </div>
    )
  }
}

export default PivotContainer;
