import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = window.location.hostname === 'localhost'
  ? "http://localhost:3001"
  : window.location.origin;

const socket = io(SOCKET_URL, {
  transports: ["websocket"]
});

function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialRoomId = urlParams.get('room') || 'default-room';

  const [roomId, setRoomId] = useState(initialRoomId);
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
  const [descInput, setDescInput] = useState(""); 
  const [isInfoVisible, setIsInfoVisible] = useState(true);
  
  // 타이머 상태
  const [timeLeft, setTimeLeft] = useState(0);

  const chatEndRef = useRef(null);
  // ref를 사용하여 handleNextTurn 내부의 최신 상태값에 접근 (타이머 0초 시 자동 전송용)
  const descInputRef = useRef("");
  const guessWordRef = useRef(""); // 라이어 정답 참조용 추가
  const currentTurnIdRef = useRef("");
  const gameStatusRef = useRef("LOBBY");

  useEffect(() => { descInputRef.current = descInput; }, [descInput]);
  useEffect(() => { guessWordRef.current = guessWord; }, [guessWord]);
  useEffect(() => { currentTurnIdRef.current = currentTurnId; }, [currentTurnId]);
  useEffect(() => { gameStatusRef.current = gameStatus; }, [gameStatus]);

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
    socket.on("update-players", (data) => setPlayers(data));
    socket.on("chat-message", (data) => setChatLog((prev) => [...prev, data]));

    socket.on("join-success", () => {
      setIsJoined(true);
      setShowError("");
    });

    socket.on("game-start", (data) => {
      setMyGameData(data);
      setGameStatus("PLAYING");
      setGameResult(null);
      setHasVoted(false);
      setVotedCount(0);
      setGuessWord("");
      setDescInput("");
    });

    socket.on("update-game-status", (status) => setGameStatus(status));
    socket.on("update-turn", (id) => setCurrentTurnId(id));
    socket.on("update-voted-count", (count) => setVotedCount(count));

    // 타이머 이벤트 수신 로직 보완
    socket.on("timer-tick", (time) => {
      setTimeLeft(time);
      
      // 누락된 부분: 시간이 0이 되었을 때 내 턴이라면 자동 전송 혹은 초기화 로직
      if (time === 0) {
        // 1. 일반 설명 단계 시간 초과
        if (gameStatusRef.current === "PLAYING" && currentTurnIdRef.current === socket.id) {
          // 시간이 다 되면 현재까지 입력한 내용이라도 강제 제출 (서버에서 다음 턴으로 넘김)
          socket.emit("next-turn", descInputRef.current || "시간 초과로 설명을 건너뜁니다.");
          setDescInput(""); 
        }
        // 2. 라이어 정답 제출 단계 시간 초과
        if (gameStatusRef.current === "LIAR_GUESS" && myGameData?.role === "LIAR") {
          // 라이어가 0초까지 정답을 못 적으면 오답 처리 유도
          socket.emit("submit-guess", guessWordRef.current || "시간 초과");
          setGuessWord("");
        }
      }
    });

    socket.on("game-result", (result) => {
      setGameResult(result);
      setGameStatus("RESULT");
      setTimeLeft(0); // 결과창 진입 시 타이머 초기화 (잔상 제거)
    });

    socket.on("error-message", (msg) => {
      setShowError(msg);
      setTimeout(() => setShowError(""), 3000);
    });

    return () => {
      socket.off("update-players");
      socket.off("chat-message");
      socket.off("join-success");
      socket.off("game-start");
      socket.off("update-game-status");
      socket.off("update-turn");
      socket.off("update-voted-count");
      socket.off("timer-tick");
      socket.off("game-result");
      socket.off("error-message");
    };
  }, [gameStatus]); // gameStatus가 바뀔 때 리스너 내부 분기 처리를 위해 의존성 추가

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (name.trim() && roomId.trim()) {
      socket.emit("join-room", { roomId, name });
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim()) {
      setShowError("채팅 내용은 공백일 수 없습니다.");
      setTimeout(() => setShowError(""), 2000);
      return;
    }
    socket.emit("send-message", { roomId, message });
    setMessage("");
  };

  const handleToggleReady = () => socket.emit("toggle-ready");
  const handleStartGame = () => socket.emit("start-game", roomId);

  const handleDescInputChange = (e) => {
    const val = e.target.value;
    setDescInput(val);
    if (currentTurnId === socket.id) {
      socket.emit("update-input", val);
    }
  };

  const handleNextTurn = (e) => {
    if (e) e.preventDefault();
    if (!descInput.trim()) {
      setShowError("단어에 대한 설명을 입력해주세요.");
      return;
    }
    socket.emit("next-turn", descInput);
    setDescInput(""); 
  };

  const handleVote = (targetId) => {
    if (hasVoted) return;
    socket.emit("submit-vote", targetId);
    setHasVoted(true);
  };

  const handleSubmitGuess = (e) => {
    e.preventDefault();
    if (guessWord.trim()) {
      socket.emit("submit-guess", guessWord);
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
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl w-full max-w-md border border-slate-200 text-center flex flex-col gap-6">
          <div>
            <h1 className="text-5xl font-black text-blue-600 tracking-tighter italic uppercase mb-2">Liar Game</h1>
            <p className="text-slate-400 font-bold text-sm tracking-widest uppercase">Multi-Room Edition</p>
          </div>
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Room ID</label>
              <input
                type="text"
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 focus:border-blue-500 rounded-2xl outline-none font-bold text-center"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Nickname</label>
              <input
                type="text"
                placeholder="닉네임 입력"
                className="w-full p-5 bg-slate-50 border-2 border-slate-100 focus:border-blue-500 rounded-2xl outline-none font-bold text-center"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={10}
              />
            </div>
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

  // 타이머가 표시되어야 하는 상태인지 확인
  const isTimerActive = ["PLAYING", "VOTING", "LIAR_GUESS"].includes(gameStatus);

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden text-slate-800 font-sans">
      {showError && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl z-50 animate-bounce font-black text-sm uppercase">
          ⚠ {showError}
        </div>
      )}

      <div className="md:hidden bg-white/80 backdrop-blur-sm p-3 flex justify-between items-center border-b shrink-0 z-40">
        <span className="font-black italic text-slate-800 tracking-tighter">🕵️ {roomId.toUpperCase()}</span>
        <button
          onClick={() => setIsInfoVisible(!isInfoVisible)}
          className="bg-slate-800 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
        >
          {isInfoVisible ? "HIDE INFO" : "SHOW INFO"}
        </button>
      </div>

      <div className="flex flex-col md:flex-row flex-1 p-2 md:p-4 gap-2 md:gap-4 overflow-hidden">
        <div className={`
          ${isInfoVisible ? 'flex' : 'hidden'} 
          md:flex w-full md:w-1/3 flex-col gap-2 md:gap-4 overflow-hidden h-full shrink-0
          max-h-[50vh] md:max-h-full transition-all duration-300
        `}>
          <div className="bg-white p-3 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 shrink-0 flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-16 md:h-16 bg-blue-100 rounded-full flex items-center justify-center shrink-0 border-2 md:border-4 border-white shadow-inner text-lg md:text-2xl">
              👤
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-black text-base md:text-xl text-slate-900 leading-none truncate max-w-[100px] md:max-w-none">{name}</span>
                <span className="bg-blue-600 text-white text-[8px] md:text-[10px] px-1.5 py-0.5 rounded-full font-black uppercase">Me</span>
              </div>
              <span className="text-slate-400 text-[9px] md:text-xs font-bold mt-1 uppercase">
                SCORE: <span className="text-blue-600">{myInfo?.score || 0}</span> | {myInfo?.isHost ? "HOST 👑" : "MEMBER"}
              </span>
            </div>
            {/* 상시 타이머 (정답 제출 단계 포함) */}
            {isTimerActive && (
              <div className={`ml-auto px-4 py-2 rounded-2xl border-2 font-black text-xl ${timeLeft <= 5 ? 'bg-rose-50 border-rose-400 text-rose-600 animate-pulse' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                {timeLeft}s
              </div>
            )}
          </div>

          <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
            <h2 className="text-base md:text-xl font-black mb-2 md:mb-4 border-b pb-2 flex justify-between items-center shrink-0 uppercase italic">
              <span>
                {gameStatus === "LOBBY" ? "🏠 Lobby" :
                  gameStatus === "VOTING" ? "🗳 Voting" :
                  gameStatus === "LIAR_GUESS" ? "🤔 Liar's Turn" :
                  gameStatus === "RESULT" ? "🏆 Result" : "🎮 Playing"}
              </span>
            </h2>

            <div className="flex-1 flex flex-col overflow-hidden">
              {(gameStatus === "PLAYING" || gameStatus === "VOTING" || gameStatus === "LIAR_GUESS") && myGameData && (
                <div className="mb-3 p-3 bg-blue-50 rounded-2xl text-center border border-blue-100 shrink-0">
                  <p className="text-[8px] text-blue-400 font-black mb-0.5 uppercase tracking-widest">Category: {myGameData.category}</p>
                  <p className="text-xl md:text-2xl font-black text-blue-900 tracking-tighter">{myGameData.word}</p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {players.map((p) => (
                  <div key={p.id}
                    className={`p-3 md:p-4 rounded-xl flex justify-between items-center border-2 transition-all ${currentTurnId === p.id ? "bg-amber-50 border-amber-400 shadow-sm" : "bg-white border-slate-50"
                      } ${socket.id === p.id ? "ring-1 ring-blue-400" : ""}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="flex items-center gap-1.5 truncate">
                        {p.isHost && <span className="text-xs" title="방장">👑</span>}
                        <span className={`font-bold text-xs md:text-sm truncate ${socket.id === p.id ? "text-blue-700 font-black" : "text-slate-700"}`}>
                          {p.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                        {p.score || 0}pt
                      </span>
                      {currentTurnId === p.id && gameStatus === "PLAYING" && (
                        <span className="text-[8px] bg-amber-400 text-white px-1.5 py-0.5 rounded-full font-black animate-pulse uppercase shrink-0">Turn</span>
                      )}
                      {(gameStatus === "LOBBY" || gameStatus === "RESULT") && !p.isHost && (
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter shrink-0 border ${p.isReady
                            ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                            : "bg-slate-50 border-slate-200 text-slate-400"
                          }`}>
                          {p.isReady ? "Ready" : "Wait"}
                        </span>
                      )}
                    </div>
                    {gameStatus === "VOTING" && !hasVoted && p.id !== socket.id && (
                      <button
                        onClick={() => handleVote(p.id)}
                        className="bg-rose-500 text-white text-[10px] px-3 py-1 rounded-lg font-black hover:bg-rose-600 transition-colors uppercase shadow-sm shrink-0"
                      >
                        지목
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-200 shrink-0">
            {gameStatus === "LOBBY" ? (
              myInfo?.isHost ? (
                <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 active:scale-95 shadow-xl shadow-blue-100 uppercase italic">게임 시작</button>
              ) : (
                <button onClick={handleToggleReady} className={`w-full py-4 rounded-2xl font-black text-lg transition-all ${myInfo?.isReady ? "bg-slate-200 text-slate-500" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}>
                  {myInfo?.isReady ? "준비완료" : "준비"}
                </button>
              )
            ) : gameStatus === "VOTING" ? (
              <div className="text-center py-4 bg-rose-50 rounded-2xl border-2 border-dashed border-rose-200 font-black uppercase text-xs text-rose-600 animate-pulse">
                {hasVoted ? `VOTED (${votedCount}/${players.length})` : "SELECT THE LIAR!"}
              </div>
            ) : gameStatus === "LIAR_GUESS" ? (
              isLiar ? (
                <form onSubmit={handleSubmitGuess} className="space-y-2">
                  <input
                    type="text"
                    value={guessWord}
                    onChange={(e) => setGuessWord(e.target.value)}
                    placeholder="시민의 단어를 입력하세요"
                    className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none font-bold text-center focus:border-rose-400 transition-all text-sm"
                  />
                  <button className="w-full bg-rose-600 text-white py-3 rounded-xl font-black hover:bg-rose-700 shadow-lg uppercase italic">정답 제출</button>
                </form>
              ) : (
                <div className="text-center py-4 bg-blue-50 rounded-2xl border-2 border-dashed border-blue-200 text-blue-600 font-black text-xs animate-pulse">LIAR IS GUESSING... ({timeLeft}s)</div>
              )
            ) : gameStatus === "RESULT" ? (
              myInfo?.isHost ? (
                <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 shadow-xl shadow-blue-100 uppercase italic">다시 시작</button>
              ) : (
                <button onClick={handleToggleReady} className={`w-full py-4 rounded-2xl font-black text-lg transition-all ${myInfo?.isReady ? "bg-slate-200 text-slate-500" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}>
                  {myInfo?.isReady ? "준비완료" : "준비"}
                </button>
              )
            ) : isMyTurn ? (
              <form onSubmit={handleNextTurn} className="space-y-2">
                <input
                  type="text"
                  value={descInput}
                  onChange={handleDescInputChange}
                  placeholder="단어에 대해 설명해주세요!"
                  className="w-full p-3 bg-amber-50 border-2 border-amber-200 rounded-xl outline-none font-bold text-center focus:border-amber-500 transition-all text-sm"
                />
                <button type="submit" className="w-full bg-amber-400 text-amber-900 py-3 rounded-xl font-black hover:bg-amber-500 shadow-lg uppercase italic border-b-4 border-amber-600 active:translate-y-1 active:border-b-0 transition-all">설명 완료</button>
              </form>
            ) : (
              <div className="text-center py-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 font-black text-xs italic animate-pulse">DESCRIBING... ({timeLeft}s)</div>
            )}
          </div>
        </div>

        <div className="flex-1 bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full min-h-0">
          <div className="p-4 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center shrink-0">
            <h3 className="font-black text-slate-800 italic uppercase text-xs flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span> {roomId.toUpperCase()} CHAT
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/10">
            {chatLog.map((chat) => (
              <div key={chat.id} className={`flex flex-col ${chat.author === name ? "items-end" : chat.author === 'SYSTEM_DESC' ? "items-center" : "items-start"}`}>
                {chat.author !== 'SYSTEM_DESC' && (
                  <span className={`text-[9px] font-black mb-1 px-2 uppercase tracking-tighter ${chat.author === 'SYSTEM' ? 'text-blue-500' : 'text-slate-400'}`}>
                    {chat.author === name ? "Me" : chat.author}
                  </span>
                )}
                <div className={`px-4 py-2 rounded-[1.2rem] max-w-[85%] break-all shadow-sm font-medium text-sm ${chat.author === 'SYSTEM' ? "bg-slate-800 text-white mx-auto text-center rounded-2xl text-[11px] py-1.5" :
                    chat.author === 'SYSTEM_DESC' ? "bg-blue-100 text-blue-900 border-2 border-blue-400 rounded-2xl w-full text-center py-3 font-black italic text-base" :
                      chat.author === name ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-slate-700 border border-slate-100 rounded-tl-none"
                  }`}>
                  {chat.message}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-50 flex gap-2 shrink-0">
            <input
              className="flex-1 p-3 bg-slate-50 rounded-xl outline-none font-bold text-slate-700 focus:bg-white border-2 border-transparent focus:border-blue-100 transition-all text-sm"
              placeholder="메시지 전송..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button className="bg-blue-600 text-white px-6 rounded-xl font-black hover:bg-blue-700 active:scale-95 shadow-lg shadow-blue-50 uppercase italic text-sm">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;