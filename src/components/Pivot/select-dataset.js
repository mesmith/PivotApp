// This contains the <select> controls
//
import React from 'react';
import {connect} from 'react-redux';
import actions from '../../actions';

class SelectDataset extends React.Component {
  constructor(props) {
    super(props);
    this.onChangeHandler = this.onChangeHandler.bind(this);
  }

  // Called when the user selects an <option>.
  // Send a Redux message.
  //
  onChangeHandler(){
    const { onChangeDatasetDispatch } = this.props;
    return function(e){

      // Dispatch Redux "change dataset" message.  This will cause
      // a new dataset to be read in.
      //
      onChangeDatasetDispatch(e.target.value);
    }
  }

  // Given an ordered list of (value, label, selected)
  // within props, return a <select> element with a list of <option>s
  //
  render(){
    const id = this.props.value.id;
    const handler = this.onChangeHandler;

    // Get the currently selected index.  There can be only one.
    // Selects '' if list contains no truthy 'selected' attribute.
    //
    const selected = this.props.value.list.reduce((v1, v2) => {
      return v2.selected? v2.name: v1;
    }, '');

    const selects = this.props.value.list.filter(i => i.show)
        .map((i, j) => {
      return (
        <option key={i.name} value={i.name}>
          {i.label}
        </option>
      )
    });

    const className = "bold " + this.props.value.headerClass;
    return (
      <div className={"dataset-control pivot-div"}>
        <span className={className}>
          {this.props.value.label}:&nbsp;
        </span>
        <select name={this.props.value.name}
            value={selected}
            onChange={handler()}>
          {selects}
        </select>
      </div>
    );
  }
}
const mapStateToProps = function(state) {
  return {};
}

const mapDispatchToProps = function(dispatch) {
  return {

    // Dispatch Redux "change dataset" message
    //
    onChangeDatasetDispatch: function(value) {
      actions.changeDataset(value)(dispatch);
    }
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(SelectDataset);
