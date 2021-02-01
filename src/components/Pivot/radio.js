// This contains the radiobutton controls
//
import React from 'react';
import {connect} from 'react-redux';
import actions from '../../actions';

class RadioGroup extends React.Component {
  constructor(props) {
    super(props);
    this.onChangeHandler = this.onChangeHandler.bind(this);
  }

  // Called when the user changes a radiobutton selector.
  // Send a Redux message.
  //
  onChangeHandler(name, value){
    const { onChangeHandlerDispatch } = this.props;
    return function(){
      onChangeHandlerDispatch(name, value);
    }
  }

  // Given an ordered list of (value, label, checked, disabled)
  // within props, return a <ul> element with a list of <li>
  //
  render(){
    const { value } = this.props;

    const id = value.name;
    const handler = this.onChangeHandler;
    const listItems = value.list.map(function(x){
      return (
        <li key={x.value}>
          <label style={x.disabled? {opacity: 0.5} : {opacity: 1.0}}>
            <input type="radio" name={id} value={x.value} disabled={x.disabled}
                onChange={handler(id, x.value)} 
                checked={x.checked} />
            {x.label}
          </label>
        </li>
      )
    });

    return (
      <div className={"control pivot-div"} style={{paddingLeft: "20px"}}>
        <span className="bold">{value.label}:</span>
        <ul className="control-radio-list">{listItems}</ul>
      </div>
    );
  }
}

const mapStateToProps = function(state) {
  return {};
}

const mapDispatchToProps = function(dispatch) {
  return {

    // Dispatch Redux "change control" message
    //
    onChangeHandlerDispatch: function(name, value) {
      actions.changeControl(name, value)(dispatch);
    }
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(RadioGroup);
