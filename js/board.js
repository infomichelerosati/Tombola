import firebaseConfig from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, arrayUnion, deleteDoc, collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Inizializza Firebase e Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// Gestione Codice Stanza
let roomId = sessionStorage.getItem('tombola_room_id');
if (!roomId) {
    roomId = Math.floor(1000 + Math.random() * 9000).toString();
    sessionStorage.setItem('tombola_room_id', roomId);
}
document.getElementById('room-id-display').textContent = roomId;
document.getElementById('lobby-room-id').textContent = roomId;

const gameDocRef = doc(db, "tombola_premium", roomId);

// Inizializza stanza se non esiste
async function initRoom() {
    const snap = await getDocs(collection(db, "tombola_premium"));
    // Creiamo il documento base con stato LOBBY
    await setDoc(gameDocRef, { 
        status: 'LOBBY',
        createdAt: Date.now(),
        settings: { card_price: 1.0 }
    }, { merge: true });
}
initRoom();

// Stato locale
let extractedNumbers = [];
let availableNumbers = Array.from({length: 90}, (_, i) => i + 1);
let cardPrice = 1.0;
window.lastWonPrizes = {};
window.lastTotalPot = 0;
window.gameOverShown = false;
window.audioUnlocked = false; // Forza lo stato iniziale

// Pre-caricamento voci migliorato
if ('speechSynthesis' in window) {
    const loadVoices = () => {
        window.speechSynthesis.getVoices();
    };
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
}

// UI Elements
const mainGrid = document.getElementById('main-grid');
const lastNumberDisplay = document.getElementById('last-number');
const btnExtract = document.getElementById('btn-extract');
const btnReset = document.getElementById('btn-reset');
const connectionStatus = document.getElementById('connection-status');
const cardPriceDisplay = document.getElementById('card-price-display');
const btnStartGame = document.getElementById('btn-start-game');
const lobbyOverlay = document.getElementById('lobby-overlay');
const lobbyPlayersList = document.getElementById('lobby-players-list');
const lobbyCountEl = document.getElementById('lobby-count');
const lobbyPotEl = document.getElementById('lobby-pot');
const autoExtractToggle = document.getElementById('auto-extract-toggle');

let autoExtractInterval = null;

const prizeDistribution = { ambo: 0.10, terno: 0.15, quaderna: 0.20, cinquina: 0.25, tombola: 0.30 };

function initBoardUI() {
    mainGrid.innerHTML = '';
    for (let i = 1; i <= 90; i++) {
        const cell = document.createElement('div');
        cell.className = 'number-cell';
        cell.id = `num-${i}`;
        cell.textContent = i;
        mainGrid.appendChild(cell);
    }
}

async function extractNumber() {
    if (availableNumbers.length === 0) return;
    const randomIndex = Math.floor(Math.random() * availableNumbers.length);
    const number = availableNumbers.splice(randomIndex, 1)[0];
    
    // Ottimistico update UI
    updateUI(number);

    try {
        await updateDoc(gameDocRef, {
            lastNumber: number,
            extractedNumbers: arrayUnion(number)
        });
        
        // ANNUNCIO VOCALE
        speakNumber(number);

    } catch (e) {
        // Se il documento non esiste ancora, lo creiamo
        await setDoc(gameDocRef, {
            lastNumber: number,
            extractedNumbers: [number],
            settings: { card_price: 1.0 }
        });
        
        // ANNUNCIO VOCALE
        speakNumber(number);
    }
}

function speakNumber(n) {
    if ('speechSynthesis' in window) {
        // Forza lo stop di eventuali code bloccate (comune su TV)
        window.speechSynthesis.cancel();

        // Sblocca audio se necessario con un'azione più decisa
        if (!window.audioUnlocked) {
            const silent = new SpeechSynthesisUtterance(" ");
            silent.volume = 0;
            window.speechSynthesis.speak(silent);
            window.audioUnlocked = true;
        }

        // Suona il "Bum Bum" prima di parlare
        playBumBum(() => {
            const msg = new SpeechSynthesisUtterance();
            msg.text = n.toString();
            
            // Logica di selezione voce più robusta
            const voices = window.speechSynthesis.getVoices();
            let itVoice = voices.find(v => v.lang.startsWith('it') || v.lang === 'it-IT');
            
            // Fallback se non trova l'italiano (usa la prima disponibile)
            if (!itVoice && voices.length > 0) {
                itVoice = voices.find(v => v.default) || voices[0];
            }
            
            if (itVoice) {
                msg.voice = itVoice;
                msg.lang = itVoice.lang;
            } else {
                msg.lang = 'it-IT';
            }
            
            msg.rate = 0.8; // Leggermente più lento per chiarezza
            msg.pitch = 1;
            msg.volume = 1;
            
            // Alcune TV richiedono un timeout per "respirare" dopo l'audio context
            setTimeout(() => {
                window.speechSynthesis.speak(msg);
            }, 100);
        });
    }
}

// Pre-caricamento voci per Smart TV
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

function playBumBum(callback) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    function playTone(time, freq, duration) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine'; // Suono puro e cupo
        osc.frequency.setValueAtTime(freq, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + duration); // Effetto caduta (kick drum)
        
        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(time);
        osc.stop(time + duration);
    }

    const now = audioCtx.currentTime;
    playTone(now, 60, 0.4);       // Primo "Bum"
    playTone(now + 0.5, 50, 0.5); // Secondo "Bum" più profondo

    // Avvia la voce dopo i due suoni (circa 1 secondo dopo)
    setTimeout(callback, 1200);
}

function updateUI(number) {
    const cell = document.getElementById(`num-${number}`);
    if (cell && !cell.classList.contains('extracted')) {
        cell.classList.add('extracted');
        lastNumberDisplay.textContent = number;
        lastNumberDisplay.style.animation = 'none';
        lastNumberDisplay.offsetHeight; 
        lastNumberDisplay.style.animation = 'numberPop 0.5s ease-out';
    }
}

function resetLocalUI() {
    extractedNumbers = [];
    availableNumbers = Array.from({length: 90}, (_, i) => i + 1);
    lastNumberDisplay.textContent = '--';
    window.gameOverShown = false;
    document.querySelectorAll('.number-cell').forEach(cell => {
        cell.classList.remove('extracted');
    });
}

// Ascolta i cambiamenti da Firestore
onSnapshot(gameDocRef, async (docSnap) => {
    connectionStatus.innerHTML = `<i class="fas fa-circle" style="color: var(--success);"></i> Connesso`;
    if (!docSnap.exists()) {
        resetLocalUI();
        updatePrizeUI(0);
        return;
    }

    const data = docSnap.data();
    
    // Sincronizza stato Lobby
    if (data.status === 'PLAYING') {
        lobbyOverlay.style.display = 'none';
    } else {
        lobbyOverlay.style.display = 'flex';
    }

    // Sincronizza numeri estratti
    if (data.extractedNumbers) {
        data.extractedNumbers.forEach(n => {
            if (!extractedNumbers.includes(n)) {
                extractedNumbers.push(n);
                const idx = availableNumbers.indexOf(n);
                if (idx > -1) availableNumbers.splice(idx, 1);
                updateUI(n);
            }
        });
    }

    if (data.lastNumber) lastNumberDisplay.textContent = data.lastNumber;

    if (data.settings) {
        cardPrice = data.settings.card_price || 1.0;
        cardPriceDisplay.textContent = `€ ${cardPrice.toFixed(2)}`;
    }

    // Calcola montepremi iniziale e aggiorna premi
    const salesSnap = await getDocs(collection(db, "tombola_premium", roomId, "sales"));
    let totalPot = 0;
    salesSnap.forEach(s => totalPot += (s.data().price || 0));
    
    window.lastWonPrizes = data.wonPrizes || {};
    window.lastTotalPot = totalPot;
    updatePrizeUI(totalPot, window.lastWonPrizes);

    // CONTROLLO FINE PARTITA (TOMBOLA)
    if (window.lastWonPrizes.tombola && !window.gameOverShown) {
        window.gameOverShown = true;
        showGameOverSummary(window.lastWonPrizes, totalPot);
    }
});

function showGameOverSummary(wonPrizes, totalPot) {
    // Coriandoli!
    confetti({
        particleCount: 200,
        spread: 70,
        origin: { y: 0.6 }
    });

    let summaryHtml = "<div style='text-align: left; margin-top: 20px;'>";
    Object.keys(prizeDistribution).forEach(p => {
        const winners = wonPrizes[p] ? Object.keys(wonPrizes[p]) : [];
        if (winners.length > 0) {
            const val = (totalPot * prizeDistribution[p]) / winners.length;
            summaryHtml += `<p><strong>${p.toUpperCase()}:</strong> ${winners.join(", ")} (€ ${val.toFixed(2)} cad.)</p>`;
        }
    });
    summaryHtml += "</div>";

    showModal({
        title: "PARTITA CONCLUSA!",
        message: "Ecco il riepilogo di tutte le vincite di oggi:",
        icon: "fas fa-trophy",
        confirmText: "NUOVA PARTITA",
        onConfirm: () => resetGame()
    });
    
    // Inseriamo il riepilogo nel corpo del modale
    document.getElementById('modal-message').innerHTML += summaryHtml;
}

// Ripristino l'ascolto in tempo reale delle vendite e aggiornamento Lobby
onSnapshot(collection(db, "tombola_premium", roomId, "sales"), (querySnapshot) => {
    let totalPot = 0;
    const players = new Set();
    lobbyPlayersList.innerHTML = '';

    querySnapshot.forEach(doc => {
        const sale = doc.data();
        totalPot += (sale.price || 0);
        if (sale.player) {
            players.add(sale.player);
        }
    });

    // Aggiorna lista nomi nella lobby
    if (players.size > 0) {
        players.forEach(name => {
            const tag = document.createElement('div');
            tag.className = 'glass';
            tag.style.padding = '10px';
            tag.style.borderRadius = '10px';
            tag.style.border = '1px solid var(--accent-gold)';
            tag.style.color = '#fff';
            tag.style.fontSize = '0.9rem';
            tag.textContent = name;
            lobbyPlayersList.appendChild(tag);
        });
        btnStartGame.disabled = false;
    } else {
        lobbyPlayersList.innerHTML = '<div style="color: var(--text-muted); grid-column: 1/-1;">In attesa di giocatori...</div>';
        btnStartGame.disabled = true;
    }

    lobbyCountEl.textContent = players.size;
    lobbyPotEl.textContent = `€ ${totalPot.toFixed(2)}`;
    
    window.lastWonPrizes = window.lastWonPrizes || {};
    updatePrizeUI(totalPot, window.lastWonPrizes);
    window.lastTotalPot = totalPot;
});

// Avvio Partita
btnStartGame.addEventListener('click', async () => {
    // Sblocca Full Screen
    if (!document.fullscreenElement) toggleFullScreen();
    
    // SBLOCCO AUDIO AGGRESSIVO (Necessario per Smart TV)
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance("Iniziamo!");
        msg.volume = 0; // Silenzioso ma attiva il motore
        window.speechSynthesis.speak(msg);
        window.audioUnlocked = true;
    }

    try {
        await updateDoc(gameDocRef, { status: 'PLAYING' });
    } catch (e) {
        showModal({ title: "Errore", message: "Impossibile iniziare la partita." });
    }
});



// Funzioni per Modale Personalizzata Versatile
window.showModal = function(options) {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-message');
    const inputEl = document.getElementById('modal-input');
    const btnConfirm = document.getElementById('modal-btn-confirm');
    const btnCancel = document.getElementById('modal-btn-cancel');
    const iconContainer = document.getElementById('modal-icon-container');

    // Reset default
    titleEl.textContent = options.title || "Avviso";
    msgEl.textContent = options.message || "";
    inputEl.style.display = options.showInput ? 'block' : 'none';
    inputEl.value = options.inputValue || "";
    btnCancel.style.display = options.showCancel ? 'block' : 'none';
    btnConfirm.textContent = options.confirmText || "OK";
    
    if (options.icon) {
        iconContainer.innerHTML = `<i class="${options.icon}" style="font-size: 3rem; color: var(--accent-gold);"></i>`;
    } else {
        iconContainer.innerHTML = `<i class="fas fa-info-circle" style="font-size: 3rem; color: var(--accent-gold);"></i>`;
    }

    // Handlers
    btnConfirm.onclick = () => {
        const val = inputEl.value;
        modal.style.display = 'none';
        if (options.onConfirm) options.onConfirm(val);
    };

    btnCancel.onclick = () => {
        modal.style.display = 'none';
        if (options.onCancel) options.onCancel();
    };

    modal.style.display = 'flex';
}

window.closeModal = function() {
    document.getElementById('custom-modal').style.display = 'none';
}

// Ascolta le notifiche
onSnapshot(collection(db, "tombola_premium", roomId, "notifications"), async (querySnapshot) => {
    querySnapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
            const win = change.doc.data();
            if (Date.now() - win.timestamp < 30000) {
                // 0. FERMA ESTRAZIONE AUTOMATICA (SE ATTIVA)
                stopAutoExtract();

                // 1. FASE DI SCANSIONE GENERALE (3 secondi)
                const grid = document.getElementById('main-grid');
                grid.classList.add('dimmed');
                
                const allExtractedCells = document.querySelectorAll('.number-cell.extracted');
                allExtractedCells.forEach(cell => cell.classList.add('scanning-all'));

                setTimeout(() => {
                    // 2. FASE DI FOCALIZZAZIONE (5 secondi)
                    allExtractedCells.forEach(cell => cell.classList.remove('scanning-all'));
                    
                    if (win.numbers) {
                        win.numbers.forEach(num => {
                            const cell = document.getElementById(`num-${num}`);
                            if (cell) cell.classList.add('verifying-number');
                        });
                    }

                    // Aspettiamo altri 5 secondi prima del modale
                    setTimeout(async () => {
                        grid.classList.remove('dimmed');
                        if (win.numbers) {
                            win.numbers.forEach(num => {
                                const cell = document.getElementById(`num-${num}`);
                                if (cell) cell.classList.remove('verifying-number');
                            });
                        }

                        // 3. MOSTRA MODALE PREMIUM E REGISTRA
                        showModal({
                            title: win.type.toUpperCase() + "!",
                            message: `${win.player.toUpperCase()} ha vinto il premio ${win.type.toUpperCase()}!`,
                            icon: "fas fa-crown",
                            onConfirm: () => {
                                // RIPRENDI ESTRAZIONE AUTOMATICA SE IL TOGGLE È ATTIVO
                                if (autoExtractToggle.checked) startAutoExtract();
                            }
                        });
                        await handleWinRegistration(win);
                        
                    }, 5000);

                }, 3000);
            }
        }
    });
});

async function handleWinRegistration(win) {
    // Usiamo il riferimento alla stanza corrente (gameDocRef)
    const docRef = gameDocRef;
    // Per sicurezza leggiamo una volta sola
    const docSnap = await getDocs(collection(db, "tombola_premium")); // Semplificato per leggere il parent
    // In realtà usiamo updateDoc con logica atomica se possibile, ma per semplicità qui facciamo:
    
    const wonPrizesPath = `wonPrizes.${win.type}`;
    
    // Aggiorniamo Firestore: aggiungiamo il giocatore alla lista per quel premio
    // Se il premio non esiste o è stato fatto sullo stesso numero, aggiungiamo
    // Altrimenti (se è un numero successivo), il premio è già chiuso.
    
    // NOTA: Per semplicità di questa fase, registriamo il vincitore. 
    // Se ci sono più vincitori per lo stesso tipo, verranno mostrati tutti.
    await updateDoc(docRef, {
        [`wonPrizes.${win.type}.${win.player}`]: {
            timestamp: win.timestamp,
            lastNumber: win.lastNumber
        }
    });
}

function updatePrizeUI(totalPot, wonPrizes = {}) {
    Object.keys(prizeDistribution).forEach(p => {
        const el = document.getElementById(`prize-${p}`);
        if (!el) return;

        const valEl = el.querySelector('.val');
        const winners = wonPrizes[p] ? Object.keys(wonPrizes[p]) : [];
        
        if (winners.length > 0) {
            el.classList.add('won');
            el.style.color = 'var(--danger)';
            // Divide il premio per il numero di vincitori
            const splitPrize = (totalPot * prizeDistribution[p]) / winners.length;
            valEl.textContent = `${winners.join(' & ')} - € ${splitPrize.toFixed(2)} cad.`;
        } else {
            el.classList.remove('won');
            el.style.color = '';
            valEl.textContent = `€ ${(totalPot * prizeDistribution[p]).toFixed(2)}`;
        }
    });
}

async function resetGame() {
    showModal({
        title: "Reset Partita",
        message: "Sei sicuro di voler resettare TUTTO? Questo cancellerà anche il montepremi e le vendite.",
        showCancel: true,
        confirmText: "SÌ, RESETTA",
        icon: "fas fa-exclamation-triangle",
        onConfirm: async () => {
            try {
                await deleteDoc(gameDocRef);
                const salesSnap = await getDocs(collection(db, "tombola_premium", roomId, "sales"));
                const notifSnap = await getDocs(collection(db, "tombola_premium", roomId, "notifications"));
                const deletePromises = [];
                salesSnap.forEach(doc => deletePromises.push(deleteDoc(doc.ref)));
                notifSnap.forEach(doc => deletePromises.push(deleteDoc(doc.ref)));
                await Promise.all(deletePromises);
                
                showModal({
                    title: "Partita Resettata",
                    message: "Tutti i dati sono stati cancellati correttamente.",
                    onConfirm: () => location.reload()
                });
            } catch (e) {
                showModal({ title: "Errore", message: "Impossibile resettare: " + e.message });
            }
        }
    });
}

window.setCardPrice = async function() {
    showModal({
        title: "Prezzo Cartella",
        message: "Inserisci il nuovo prezzo per cartella (es. 1.50):",
        showInput: true,
        inputValue: cardPrice.toFixed(2),
        showCancel: true,
        confirmText: "SALVA",
        onConfirm: async (val) => {
            const newPrice = parseFloat(val);
            if (!isNaN(newPrice) && newPrice > 0) {
                try {
                    await updateDoc(gameDocRef, { "settings.card_price": newPrice });
                } catch (e) {
                    showModal({ title: "Errore", message: "Impossibile aggiornare il prezzo." });
                }
            } else {
                showModal({ title: "Valore non valido", message: "Inserisci un numero valido maggiore di zero." });
            }
        }
    });
}

btnExtract.addEventListener('click', extractNumber);
btnReset.addEventListener('click', resetGame);
cardPriceDisplay.parentElement.addEventListener('click', setCardPrice);

autoExtractToggle.addEventListener('change', () => {
    if (autoExtractToggle.checked) {
        startAutoExtract();
    } else {
        stopAutoExtract();
    }
});

function startAutoExtract() {
    stopAutoExtract(); // Pulizia preventiva
    if (availableNumbers.length === 0) return;
    
    autoExtractInterval = setInterval(() => {
        if (availableNumbers.length > 0) {
            extractNumber();
        } else {
            stopAutoExtract();
            autoExtractToggle.checked = false;
        }
    }, 10000);
}

function stopAutoExtract() {
    if (autoExtractInterval) {
        clearInterval(autoExtractInterval);
        autoExtractInterval = null;
    }
}

// Inizializzazione UI
initBoardUI();
updatePrizeUI(0);

window.shareWhatsApp = function() {
    const text = `Vieni a giocare a Tombola con noi! 🎄\nCodice Stanza: *${roomId}*\nLink: ${window.location.href.replace('board.html', 'player.html')}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

window.toggleFullScreen = function() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}
