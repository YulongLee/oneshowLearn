import {AiTutorChat} from './AiTutorChat.jsx';
import {useAiCapabilities} from './useAiCapabilities.js';
import './tutor-conversation.css';

export function AiTutor({model, navigate, notify}) {
  const cap = useAiCapabilities(model.user?.id);
  return <AiTutorChat key={model.user?.id || 'anonymous'} model={model} cap={cap} navigate={navigate} notify={notify}/>;
}
