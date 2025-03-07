import React, { useState, useEffect, useRef } from 'react';
import { model, auth, firestore } from './firebase.jsx';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

function Chat({ conversationId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatSession = useRef(null);
  const user = auth.currentUser;

  const conversationDocRef = conversationId ? doc(firestore, 'users', user.uid, 'conversations', conversationId) : null;

  useEffect(() => {
    if (!conversationId) return;
    async function loadChat() {
      console.log("Loading conversation history for ID:", conversationId);
      const conversationDoc = await getDoc(conversationDocRef);
      let initialHistory;
      if (conversationDoc.exists()) {
        console.log("Conversation history found in Firestore");
        initialHistory = conversationDoc.data().messages;
        setMessages(initialHistory);
      } else {
        console.log("No conversation history found. Initializing new conversation.");
        initialHistory = [
          { role: 'user', text: "Hello, I have 2 dogs in my house." },
          { role: 'bot', text: "Great to meet you. What would you like to know?" },
        ];
        setMessages(initialHistory);
        await setDoc(conversationDocRef, { messages: initialHistory, title: "New Conversation" });
      }
      console.log("Initializing chat session with history");
      chatSession.current = model.startChat({
        history: initialHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }],
        })),
        generationConfig: { maxOutputTokens: 100 },
      });
      console.log("Chat session initialized:", chatSession.current);
    }
    loadChat();
  }, [conversationId, conversationDocRef]);

  const saveChat = async (newMessages) => {
    if (!conversationDocRef) return;
    console.log("Saving conversation history:", newMessages);
    await updateDoc(conversationDocRef, { messages: newMessages });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || !conversationDocRef) return;

    console.log("User submitted message:", input);
    const userMessage = { role: 'user', text: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    await saveChat(updatedMessages);

    setInput('');
    setLoading(true);

    try {
      const resultStream = await chatSession.current.sendMessageStream(input);
      let botText = '';
      setMessages(prev => {
        const msgs = [...prev, { role: 'bot', text: botText, temp: true }];
        saveChat(msgs);
        return msgs;
      });

      for await (const chunk of resultStream.stream) {
        const chunkText = chunk.text();
        botText += chunkText;
        setMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1] = { role: 'bot', text: botText, temp: true };
          saveChat(msgs);
          return msgs;
        });
      }

      setMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { role: 'bot', text: botText };
        saveChat(msgs);
        return msgs;
      });
    } catch (error) {
      console.error("Error in handleSubmit:", error);
      const errorMessage = { role: 'bot', text: "Error: " + error.message };
      setMessages(prev => {
        const msgs = [...prev, errorMessage];
        saveChat(msgs);
        return msgs;
      });
    }
    setLoading(false);
  };

  return (
    <div>
      {!conversationId ? (
        <h2 className="text-center">Please select a conversation from the sidebar or create a new one.</h2>
      ) : (
        <>
          <div className="card">
            <div className="card-body" style={{ height: '400px', overflowY: 'auto' }}>
              {messages.map((msg, index) => (
                <div key={index} className={`mb-2 text-${msg.role === 'user' ? 'end' : 'start'}`}>
                  <span className={`badge bg-${msg.role === 'user' ? 'primary' : 'secondary'}`}>
                    {msg.role === 'user' ? 'You' : 'Bot'}
                  </span>
                  <p className="mt-1">{msg.text}</p>
                </div>
              ))}
              {loading && <div className="text-center">Loading...</div>}
            </div>
          </div>
          <form onSubmit={handleSubmit} className="mt-3">
            <div className="input-group">
              <input
                type="text"
                className="form-control"
                placeholder="Type your message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={loading}>
                Send
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

export default Chat;