import {Component} from 'react';

// A failed deferred download must show recovery instead of a blank application.
// Reload is explicit, so existing beforeunload draft guards remain in control.
export class RouteLoadBoundary extends Component {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidUpdate(previous){if(this.state.failed&&previous.resetKey!==this.props.resetKey)this.setState({failed:false});}
  render(){
    if(this.state.failed)return <section role="alert" className="route-load-error"><p>页面暂时无法加载，请检查网络后刷新重试。已保存的学习记录不会删除。</p><button onClick={()=>window.location.reload()}>刷新重试</button></section>;
    return this.props.children;
  }
}
