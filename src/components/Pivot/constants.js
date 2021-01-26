//
const constants = function(){
  const sumrecords = '# Records';  // We keep a grouped tally of records 
                                   // and name it this

  const Null = '(null)';
  const avgSuffix = ' (avg)';
  const graphtypeListAll = [
    { checked: false, label: 'Bubble Chart', value: 'bubble', default: true },
    { checked: false, label: 'Line Chart', value: 'line', },
    { checked: false, label: 'Force graph', value: 'force', },
    { checked: false, label: 'Force graph w/ status', value: 'forceStatus', },
    { checked: false, label: 'Map', value: 'map', },
  ];
  const graphtypeListAis = [
    { checked: false, label: 'Bubble Chart', value: 'bubble', default: true },
    { checked: false, label: 'Line Chart', value: 'line', },
    { checked: false, label: 'Pareto Chart', value: 'pareto', }
  ];
  const graphtypeListFB = [
    { checked: false, label: 'Bubble Chart', value: 'bubble', default: true },
    { checked: false, label: 'Line Chart', value: 'line', },
    { checked: false, label: 'Pareto Chart', value: 'pareto', }
  ];

  const graphtypeMap = {
    ais: graphtypeListAis,
    dflt: graphtypeListAis,
    all: graphtypeListAll
  };
  const graphtypeList = graphtypeMap.hasOwnProperty(process.env.CUSTOMER)
    ? graphtypeMap[process.env.CUSTOMER]
    : graphtypeMap.dflt;

  const graphtypeControls = {
    id: 'graphtype',
    name: 'graphtype',
    label: 'Graph Type',
    list: graphtypeList,
  };

  const d3geom = {
    WIDTH: 900, // width of the graph
    HEIGHT: 400, // height of the graph

    // margins around the graph
    //
    // MARGINS: {top: 20, right: 20, bottom: 20, left: 110, innerleft: 80}
    // MARGINS: {top: 80, right: 50, bottom: 80, left: 140, innerleft: 140}
    //
    MARGINS: {top: 20, right: 80, bottom: 20, left: 140, innerleft: 120,
       innerleftPareto: 100, rightPareto: 40}
  };

  // Establish minimum amount of "buffer" for charts (so bubbles are
  // visible)
  //
  const d3buffer = {
    minBuffer: 1.1,  // 10% over largest value
    minRange: 0    // minimum range from lowest to smallest value
  };

  const generalImprovement = 'General Improvement';

  // These are used for the Pareto chart
  //
  const cumulative = {
    amount: 'Cumulative Amount',
    percent: 'Cumulative Percentage',
    total: 'Cumulative Total'
  };

  const dataFolder = 'static/data';

  return {
    sumrecords,
    Null,
    avgSuffix,
    graphtypeControls,
    d3geom,
    d3buffer,
    generalImprovement,
    cumulative,
    dataFolder
  };
}();

module.exports = constants;
