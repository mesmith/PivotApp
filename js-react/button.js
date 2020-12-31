// This contains the <button> controls (undo/redo)
//
import React from 'react';
import actions from './actions.js';

class Button extends React.Component {
  
  // Called when the user presses a button.
  // Send a Redux message.
  //
  onButtonPress(name, reduxStore){
    return function(){

      // Dispatch Redux "Button Press" message.  This will cause
      // the state to be changed, in turn changing controls
      // sensitivity as well as data being redrawn.
      //
      reduxStore.dispatch(actions.pressButton(name));
    }
  }

  // Return <input> button.
  //
  render(){
    const handler = this.onButtonPress(this.props.value, this.props.reduxStore);

    return (
      <input type="button" value={this.props.label} 
          disabled={!this.props.show}
          name={this.props.value} onClick={handler}/>
    );
  }
}

export default Button;
