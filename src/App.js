import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001", { transports: ["websocket"] });

function App() {
  const [name, setName] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [players, setPlayers] = useState([]);
  const [message, setMessage] = useState("");
  const [chatLog, setChatLog] = useState([]);
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  const [gameStatus, setGameStatus] = useState("LOBBY");
  const [myGameData, setMyGameData] = useState(null); 
  const [showError, setShowError] = useState(""); 
  const [currentTurnId, setCurrentTurnId] = useState(""); 
  
  const [votedCount, setVotedCount] = useState(0);
  const [gameResult, setGameResult] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [guessWord, setGuessWord] = useState("");

  const chatEndRef = useRef(null);

  useEffect(() => {
    const scriptId = "tailwind-cdn";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("update_players", (data) => setPlayers(data));
    socket.on("receive_message", (data) => setChatLog((prev) => [...prev, data]));
    
    socket.on("join_success", () => {
      setIsJoined(true);
      setShowError("");
    });
    
    socket.on("game_start_info", (data) => {
      setMyGameData(data);
      setGameStatus("PLAYING");
      setGameResult(null);
      setHasVoted(false);
      setVotedCount(0);
      setGuessWord("");
    });

    socket.on("update_game_status", (status) => setGameStatus(status));
    socket.on("update_turn", (id) => setCurrentTurnId(id));
    socket.on("update_voted_count", (count) => setVotedCount(count));
    
    socket.on("game_result", (result) => {
      setGameResult(result);
      setGameStatus("RESULT");
    });

    socket.on("game_error", (msg) => {
      setShowError(msg);
      setTimeout(() => setShowError(""), 3000);
    });

    return () => {
      socket.off("update_players");
      socket.off("receive_message");
      socket.off("join_success");
      socket.off("game_start_info");
      socket.off("update_game_status");
      socket.off("update_turn");
      socket.off("update_voted_count");
      socket.off("game_result");
      socket.off("game_error");
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (name.trim()) {
      socket.emit("join_room", name);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    // 채팅 공백 전송 시 에러 UI 처리 로직
    if (!message.trim()) {
      setShowError("채팅 내용은 공백일 수 없습니다.");
      setTimeout(() => setShowError(""), 2000);
      return;
    }
    socket.emit("send_message", { message, author: name });
    setMessage("");
  };

  const handleToggleReady = () => socket.emit("toggle_ready");
  const handleStartGame = () => socket.emit("start_game");
  const handleNextTurn = () => socket.emit("next_turn");
  
  const handleVote = (targetId) => {
    if (hasVoted) return;
    socket.emit("submit_vote", targetId);
    setHasVoted(true);
  };

  const handleSubmitGuess = (e) => {
    e.preventDefault();
    if (guessWord.trim()) {
      socket.emit("submit_guess", guessWord);
    }
  };

  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4 relative">
        {showError && (
          <div className="absolute top-10 bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl z-50 animate-bounce font-black text-sm uppercase">
            ⚠ {showError}
          </div>
        )}
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl w-full max-w-md border border-slate-200 text-center flex flex-col gap-8 transition-all">
          <div>
            <h1 className="text-5xl font-black text-blue-600 tracking-tighter italic uppercase mb-2">Liar Game</h1>
            <p className="text-slate-400 font-bold text-sm tracking-widest uppercase">Social Guessing Game</p>
          </div>
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              placeholder="닉네임 입력"
              className="w-full p-5 bg-slate-50 border-2 border-slate-100 focus:border-blue-500 rounded-2xl outline-none font-bold text-center transition-all"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={10}
            />
            <button type="submit" className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black text-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 uppercase active:scale-95">입장하기</button>
          </form>
          <div className="flex items-center justify-center gap-2 text-slate-300 font-bold text-[10px] uppercase tracking-widest">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
            {isConnected ? 'Server Connected' : 'Connecting...'}
          </div>
        </div>
      </div>
    );
  }

  const myInfo = players.find(p => p.id === socket.id);
  const isMyTurn = currentTurnId === socket.id;
  const isLiar = myGameData?.role === "LIAR";

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-100 p-4 gap-4 overflow-hidden text-slate-800 font-sans">
      {showError && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl z-50 animate-bounce font-black text-sm uppercase">
          ⚠ {showError}
        </div>
      )}

      {/* 왼쪽 사이드바: 플레이어 리스트 및 정보 */}
      <div className="w-full md:w-1/3 flex flex-col gap-4 overflow-hidden h-full">
        {/* 프로필 정보 상단 고정 */}
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 shrink-0 flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-inner">
            <span className="text-2xl">👤</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-black text-xl text-slate-900 leading-none">{name}</span>
              <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black uppercase">Me</span>
            </div>
            <span className="text-slate-400 text-xs font-bold mt-1">
              SCORE: <span className="text-blue-600">{myInfo?.score || 0}</span> | {myInfo?.isHost ? "방장 👑" : "멤버"}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
          <h2 className="text-xl font-black mb-4 border-b pb-2 flex justify-between items-center">
             <span>
               {gameStatus === "LOBBY" ? "🏠 대기실" : 
                gameStatus === "VOTING" ? "🗳 투표 중" : 
                gameStatus === "LIAR_GUESS" ? "🤔 라이어의 선택" : 
                gameStatus === "RESULT" ? "🏆 결과" : "🎮 게임 중"}
             </span>
             <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{players.length} Players</span>
          </h2>
          
          {(gameStatus === "PLAYING" || gameStatus === "VOTING" || gameStatus === "LIAR_GUESS") && myGameData && (
            <div className="mb-4 p-4 bg-blue-50 rounded-3xl text-center border border-blue-100 shadow-inner">
              <p className="text-[10px] text-blue-400 font-black mb-1 uppercase tracking-widest">카테고리: {myGameData.category}</p>
              <p className="text-3xl font-black text-blue-900 tracking-tighter">{myGameData.word}</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {players.map((p) => (
              <div key={p.id} className={`p-4 rounded-2xl flex justify-between items-center border-2 transition-all ${
                socket.id === p.id 
                  ? "bg-slate-50 border-blue-200 shadow-md ring-2 ring-blue-100" 
                  : currentTurnId === p.id ? "bg-amber-50 border-amber-400" : "bg-white border-slate-50"
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-sm ${socket.id === p.id ? "text-blue-700 font-black" : "text-slate-700"}`}>
                    {p.name} {p.isHost && "👑"}
                  </span>
                  {socket.id === p.id && <span className="bg-blue-100 text-blue-600 text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase">나</span>}
                  <span className="text-[10px] text-slate-400">({p.score}pts)</span>
                  {currentTurnId === p.id && gameStatus === "PLAYING" && (
                    <span className="text-[8px] bg-amber-400 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-tighter ml-1 animate-pulse">설명 중</span>
                  )}
                </div>
                {gameStatus === "VOTING" && !hasVoted && p.id !== socket.id && (
                  <button onClick={() => handleVote(p.id)} className="bg-rose-500 text-white text-[10px] px-3 py-1.5 rounded-xl font-black hover:bg-rose-600 transition-colors shadow-sm shadow-rose-100 uppercase">지목</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 액션 버튼 영역 */}
        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 shrink-0">
          {gameStatus === "LOBBY" ? (
            myInfo?.isHost ? (
              <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-5 rounded-[1.8rem] font-black text-xl hover:bg-blue-700 active:scale-95 shadow-xl shadow-blue-100 uppercase tracking-tighter italic">게임 시작</button>
            ) : (
              <button onClick={handleToggleReady} className={`w-full py-5 rounded-[1.8rem] font-black text-xl transition-all shadow-lg ${myInfo?.isReady ? "bg-slate-200 text-slate-500 shadow-none" : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-100 uppercase"}`}>
                {myInfo?.isReady ? "준비 완료" : "준비하기"}
              </button>
            )
          ) : gameStatus === "VOTING" ? (
            <div className="text-center py-4 bg-rose-50 rounded-2xl border-2 border-dashed border-rose-200">
              <p className="text-rose-600 font-black uppercase tracking-widest text-sm animate-pulse">
                {hasVoted ? `투표 완료 (${votedCount}/${players.length})` : "라이어를 지목하세요!"}
              </p>
            </div>
          ) : gameStatus === "LIAR_GUESS" ? (
            isLiar ? (
              <form onSubmit={handleSubmitGuess} className="space-y-3">
                <p className="text-xs font-black text-rose-500 text-center uppercase tracking-tighter">시민의 단어를 입력하세요!</p>
                <input 
                  type="text" 
                  value={guessWord} 
                  onChange={(e) => setGuessWord(e.target.value)}
                  placeholder="정답은 무엇일까요?"
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold text-center focus:border-rose-400 transition-all"
                />
                <button className="w-full bg-rose-600 text-white py-4 rounded-2xl font-black hover:bg-rose-700 shadow-lg shadow-rose-100 uppercase italic">정답 제출</button>
              </form>
            ) : (
              <div className="text-center py-6 bg-blue-50 rounded-2xl border-2 border-dashed border-blue-200">
                <p className="text-blue-600 font-black uppercase tracking-widest text-sm animate-pulse italic text-[11px]">라이어가 정답을 유추 중...</p>
              </div>
            )
          ) : gameStatus === "RESULT" ? (
            myInfo?.isHost && <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-5 rounded-[1.8rem] font-black text-xl hover:bg-blue-700 shadow-xl shadow-blue-100 uppercase italic">다시 시작</button>
          ) : isMyTurn ? (
            <button onClick={handleNextTurn} className="w-full bg-amber-400 text-amber-900 py-5 rounded-[1.8rem] font-black text-xl hover:bg-amber-500 animate-pulse uppercase italic border-b-4 border-amber-600">설명 완료</button>
          ) : (
            <div className="text-center py-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <p className="text-slate-400 font-black uppercase tracking-widest text-[11px] italic animate-pulse">다른 플레이어의 설명 중...</p>
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽 메인: 채팅창 */}
      <div className="flex-1 bg-white rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full">
        <div className="p-5 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center shrink-0">
          <h3 className="font-black text-slate-800 tracking-tight italic uppercase text-sm flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-400 rounded-full"></span> Live Chat
          </h3>
          {gameStatus === "RESULT" && gameResult && (
            <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-tighter ${gameResult.voteSuccess ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
              검거: {gameResult.voteSuccess ? "성공" : "실패"} | 라이어 답: {gameResult.guessSuccess ? "정답" : "오답"}
            </span>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/10">
          {gameStatus === "RESULT" && gameResult && (
            <div className="mb-6 p-6 bg-white border-4 border-blue-500 rounded-[2rem] text-center shadow-xl animate-in zoom-in duration-300">
              <p className="text-[10px] text-slate-400 font-bold mb-2 uppercase tracking-widest italic">The Liar was...</p>
              <h3 className="text-4xl font-black text-slate-800 mb-2 tracking-tight italic">{gameResult.liar.name}</h3>
              <p className="font-bold text-blue-600 uppercase text-xs mb-4">정답 단어: {gameResult.liar.word}</p>
              <div className="inline-block px-8 py-3 bg-blue-600 text-white rounded-2xl font-black italic uppercase tracking-tighter">
                Game Over
              </div>
            </div>
          )}
          
          {chatLog.map((chat) => (
            <div key={chat.id} className={`flex flex-col ${chat.author === name ? "items-end" : "items-start"}`}>
              <span className={`text-[10px] font-black mb-1 px-2 uppercase tracking-tighter ${chat.author === 'SYSTEM' ? 'text-blue-500' : 'text-slate-400'}`}>
                {chat.author === name ? "Me" : chat.author}
              </span>
              <div className={`px-5 py-3 rounded-[1.5rem] max-w-[85%] break-all shadow-sm font-medium text-sm ${
                chat.author === 'SYSTEM' ? "bg-slate-800 text-white mx-auto text-center rounded-2xl text-[12px] py-2" :
                chat.author === name ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-slate-700 border border-slate-100 rounded-tl-none"
              }`}>
                {chat.message}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        
        <form onSubmit={handleSendMessage} className="p-6 bg-white border-t border-slate-50 flex gap-3 shrink-0">
          <input
            className="flex-1 p-4 bg-slate-50 rounded-2xl outline-none font-bold text-slate-700 placeholder:text-slate-300 focus:bg-white border-2 border-transparent focus:border-blue-100 transition-all text-sm"
            placeholder="메시지를 입력하세요..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-blue-700 active:scale-95 shadow-lg shadow-blue-50 uppercase tracking-tighter italic">Send</button>
        </form>
      </div>
    </div>
  );
}

export default App;