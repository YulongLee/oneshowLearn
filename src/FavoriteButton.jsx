import {useRef,useState} from 'react';
import {BookmarkSimple} from '@phosphor-icons/react';
import {hasFavorite,toggleFavorite} from './favorite-reference.js';
import './favorite-entry.css';

// Small secondary action, shared data and no nested interactive elements.
export function FavoriteButton({model,navigate,reference,title,compact=false}){
 const saved=hasFavorite(model.state,reference),pending=useRef(false);
 const [error,setError]=useState('');
 const click=async e=>{
  e.stopPropagation();if(pending.current||model.busy||model.loading)return;
  if(!model.user)return navigate('/login?returnTo='+encodeURIComponent(location.pathname+location.search));
  pending.current=true;setError('');
  try{if(!await model.saveState(toggleFavorite(model.state,reference)))setError('收藏未保存，请重试');}
  catch{setError('收藏未保存，请重试');}finally{pending.current=false;}
 };
 return <span className="favorite-entry"><button type="button" className="favorite-entry-button" data-compact={compact||undefined} aria-label={`${saved?'取消收藏':'收藏'}：${title}`} title={`${saved?'取消收藏':'收藏'}${title}`} aria-pressed={saved} disabled={model.busy||model.loading} onClick={click}><BookmarkSimple size={18} weight={saved?'fill':'regular'}/>{!compact&&<span>{saved?'已收藏':'收藏'}</span>}</button>{error&&<small role="alert">{error}</small>}</span>;
}
