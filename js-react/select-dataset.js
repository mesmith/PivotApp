// This contains the <select> controls
//
import React from 'react';
import actions from './actions.js';

class SelectDataset extends React.Component {

  // Called when the user selects an <option>.
  // Send a Redux message.
  //
  onChangeHandler(reduxStore){
    return function(e){

      // Dispatch Redux "change dataset" message.  This will cause
      // a new dataset to be read in.
      //
      reduxStore.dispatch(actions.changeDataset(e.target.value));
    }
  }

  // Given an ordered list of (value, label, selected)
  // within props, return a <select> element with a list of <option>s
  //
  render(){
    const id = this.props.value.id;
    const handler = this.onChangeHandler;
    const reduxStore = this.props.reduxStore;

    // Get the currently selected index.  There can be only one.
    // Selects '' if list contains no truthy 'selected' attribute.
    //
    const selected = this.props.value.list.reduce((v1, v2) => {
      return v2.selected? v2.name: v1;
    }, '');

    const selects = this.props.value.list.filter(i => i.show)
        .map((i, j) => {
      const nid = id + j;
      return (
        <option key={i.name} id={nid} value={i.name}>
          {i.label}
        </option>
      )
    });

    const className = "bold " + this.props.value.headerClass;
    return (
      <div className="dataset-control">
        <span className={className}>
          {this.props.value.label}:
        </span>
        <select id={this.props.value.id} name={this.props.value.name}
            value={selected}
            onChange={handler(reduxStore)}>
          {selects}
        </select>
      </div>
    );
  }
}

export default SelectDataset;
