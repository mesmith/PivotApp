// This contains the <button> controls (undo/redo)
//
import React from 'react';
import {connect} from 'react-redux';
import actions from '../../actions';

class Button extends React.Component {
  constructor(props) {
    super(props);
    this.onButtonPress = this.onButtonPress.bind(this);
  }
  
  // Called when the user presses a button.
  // Send a Redux message.
  //
  onButtonPress(name){
    const { onButtonPressDispatch } = this.props;
    return function(){

      // Dispatch Redux "Button Press" message.  This will cause
      // the state to be changed, in turn changing controls
      // sensitivity as well as data being redrawn.
      //
      onButtonPressDispatch(name);
    }
  }

  // Return <input> button.
  //
  render(){
    const { value, label, show } = this.props;
    const handler = this.onButtonPress(value);

    return (
      <div className="pivot-button">
        <input type="button" value={label} disabled={!show}
            name={value} onClick={handler}/>
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
    onButtonPressDispatch: function(name) {
      actions.pressButton(name)(dispatch);
    }
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Button);
