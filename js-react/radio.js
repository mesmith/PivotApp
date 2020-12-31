// This contains the radiobutton controls
//
import React from 'react';
import actions from './actions.js';

class RadioGroup extends React.Component {

  // Called when the user changes a radiobutton selector.
  // Send a Redux message.
  //
  onChangeHandler(name, value, reduxStore){
    return function(){

      // Dispatch Redux "change control" message
      //
      reduxStore.dispatch(actions.changeControl(name, value));
    }
  }

  // Given an ordered list of (value, label, checked, disabled)
  // within props, return a <ul> element with a list of <li>
  //
  render(){
    const id = this.props.value.name;
    const handler = this.onChangeHandler;
    const reduxStore = this.props.reduxStore;
    const listItems = this.props.value.list.map(function(x){
      return (
        <li key={x.value}>
          <label style={x.disabled? {opacity: 0.5} : {opacity: 1.0}}>
            <input type="radio" name={id} value={x.value} disabled={x.disabled}
                onChange={handler(id, x.value, reduxStore)} 
                checked={x.checked} />
            {x.label}
          </label>
        </li>
      )
    });

    return (
      <div className="control" style={{paddingLeft: "20px"}}>
        <span className="bold">{this.props.value.label}:</span>
        <ul id={this.props.value.id}>{listItems}</ul>
      </div>
    );
  }
}

export default RadioGroup;
