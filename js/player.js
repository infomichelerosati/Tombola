import firebaseConfig from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Stato locale e Persistenza
let roomId = localStorage.getItem('tombola_room_id') || "";
let playerName = localStorage.getItem('tombola_player_name') || "";
let myCards = JSON.parse(localStorage.getItem('tombola_my_cards')) || [];
let extractedNumbers = [];
let currentPrice = 1.0;
let selectedCount = 0;
window.gameOverShown = false;
window.currentWonPrizes = {};

const cardsArea = document.getElementById('cards-area');
const autoCheckToggle = document.getElementById('auto-check');
const lastNumberMobile = document.getElementById('last-number-mobile');
const purchaseOverlay = document.getElementById('purchase-overlay');
const btnConfirm = document.getElementById('btn-confirm-purchase');
const totalCostDisplay = document.getElementById('total-cost-display');
const playerNameInput = document.getElementById('player-name-input');
const roomIdInput = document.getElementById('room-id-input');

const prizeDistribution = { ambo: 0.10, terno: 0.15, quaderna: 0.20, cinquina: 0.25, tombola: 0.30 };

// Funzioni per Modale Personalizzata
window.showModal = function(options) {
    const modal = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-message');
    const inputEl = document.getElementById('modal-input');
    const btnConfirm = document.getElementById('modal-btn-confirm');
    const btnCancel = document.getElementById('modal-btn-cancel');
    const iconContainer = document.getElementById('modal-icon-container');

    titleEl.textContent = options.title || "Avviso";
    msgEl.textContent = options.message || "";
    inputEl.style.display = options.showInput ? 'block' : 'none';
    inputEl.value = options.inputValue || "";
    btnCancel.style.display = options.showCancel ? 'block' : 'none';
    btnConfirm.textContent = options.confirmText || "OK";
    
    iconContainer.innerHTML = `<i class="${options.icon || 'fas fa-info-circle'}" style="font-size: 2.5rem; color: var(--accent-gold);"></i>`;

    btnConfirm.onclick = () => {
        modal.style.display = 'none';
        if (options.onConfirm) options.onConfirm(inputEl.value);
    };
    btnCancel.onclick = () => {
        modal.style.display = 'none';
        if (options.onCancel) options.onCancel();
    };
    modal.style.display = 'flex';
}

// Inizializzazione Sessione
if (roomId && playerName && myCards.length > 0) {
    purchaseOverlay.style.display = 'none';
    document.getElementById('player-id-tag').textContent = `Room: ${roomId} | ${playerName}`;
    startSync();
    myCards.forEach((c, i) => renderCard(c, i));
} else {
    playerNameInput.value = playerName;
    roomIdInput.value = roomId;
}

function startSync() {
    const gameDocRef = doc(db, "tombola_premium", roomId);
    
    onSnapshot(gameDocRef, async (docSnap) => {
        if (!docSnap.exists()) {
            localStorage.clear();
            location.reload();
            return;
        }
        const data = docSnap.data();
        
        if (data.extractedNumbers) {
            extractedNumbers = data.extractedNumbers.map(n => parseInt(n));
        }

        if (data.status === 'LOBBY') {
            showWaitingOverlay();
        } else {
            hideWaitingOverlay();
        }

        if (data.settings) {
            currentPrice = data.settings.card_price || 1.0;
            updateTotalDisplay();
        }
        if (data.lastNumber) {
            lastNumberMobile.textContent = data.lastNumber;
            autoCheck(data.lastNumber);
        }

        // Calcolo vincite
        window.currentWonPrizes = data.wonPrizes || {};
        if (window.currentWonPrizes && playerName) {
            const salesSnap = await getDocs(collection(db, "tombola_premium", roomId, "sales"));
            let totalPot = 0;
            salesSnap.forEach(s => totalPot += (s.data().price || 0));
            
            let myTotalWinnings = 0;
            Object.keys(window.currentWonPrizes).forEach(prizeType => {
                const winnersObj = window.currentWonPrizes[prizeType];
                if (!winnersObj) return; // FIX: evita errore keys(undefined)

                const winnersNames = Object.keys(winnersObj);
                if (winnersNames.includes(playerName)) {
                    myTotalWinnings += (totalPot * prizeDistribution[prizeType]) / winnersNames.length;
                }
                const btn = document.querySelector(`button[onclick*="'${prizeType}'"]`);
                if (btn) {
                    btn.disabled = true;
                    btn.style.opacity = '0.3';
                    btn.style.filter = 'grayscale(1)';
                    btn.style.pointerEvents = 'none';
                }
            });
            document.getElementById('player-winnings-display').textContent = `€ ${myTotalWinnings.toFixed(2)}`;
            
            if (window.currentWonPrizes.tombola && !window.gameOverShown) {
                window.gameOverShown = true;
                showGameOverSummary(window.currentWonPrizes, totalPot);
            }
        }
    });

    onSnapshot(collection(db, "tombola_premium", roomId, "sales"), (querySnapshot) => {
        let totalPot = 0;
        querySnapshot.forEach(doc => totalPot += (doc.data().price || 0));
        document.getElementById('total-pot').textContent = totalPot.toFixed(2);
    });
}

function showWaitingOverlay() {
    let overlay = document.getElementById('waiting-admin-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'waiting-admin-overlay';
        overlay.className = 'glass';
        overlay.style = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 900; display: flex; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(10px);";
        overlay.innerHTML = `
            <div class="loader" style="width: 50px; height: 50px; border: 5px solid var(--accent-gold); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
            <h2 class="title-main">Pronti?</h2>
            <p style="color: var(--text-muted);">In attesa che l'Admin inizi la partita...</p>
        `;
        document.body.appendChild(overlay);
        const style = document.createElement('style');
        style.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
        document.head.appendChild(style);
    }
    overlay.style.display = 'flex';
}

function hideWaitingOverlay() {
    const overlay = document.getElementById('waiting-admin-overlay');
    if (overlay) overlay.style.display = 'none';
}

btnConfirm.addEventListener('click', async () => {
    playerName = playerNameInput.value.trim();
    roomId = roomIdInput.value.trim();
    
    if (!playerName || !roomId) {
        showModal({ title: "Dati mancanti", message: "Inserisci nome e codice stanza!", icon: "fas fa-exclamation-circle" });
        return;
    }

    try {
        const roomRef = doc(db, "tombola_premium", roomId);
        const roomSnap = await getDocs(collection(db, "tombola_premium"));
        const roomDoc = roomSnap.docs.find(d => d.id === roomId);
        
        if (!roomDoc) {
            showModal({ title: "Stanza non trovata", message: "Il codice inserito non corrisponde a nessuna partita attiva.", icon: "fas fa-search" });
            return;
        }

        if (roomDoc.data().status !== 'LOBBY') {
            showModal({ title: "Iscrizioni Chiuse", message: "La partita è già iniziata.", icon: "fas fa-lock" });
            return;
        }

        localStorage.setItem('tombola_player_name', playerName);
        localStorage.setItem('tombola_room_id', roomId);
        
        purchaseOverlay.style.opacity = '0';
        setTimeout(() => purchaseOverlay.style.display = 'none', 300);
        
        for (let i = 0; i < selectedCount; i++) buyCard(i);
        localStorage.setItem('tombola_my_cards', JSON.stringify(myCards));
        
        document.getElementById('player-id-tag').textContent = `Room: ${roomId} | ${playerName}`;
        startSync();

    } catch (e) {
        showModal({ title: "Errore", message: "Impossibile collegarsi alla stanza." });
    }
});

async function buyCard(index) {
    const newCard = generateBingoCard();
    myCards.push(newCard);
    renderCard(newCard, index);
    try {
        await addDoc(collection(db, "tombola_premium", roomId, "sales"), {
            timestamp: Date.now(),
            price: currentPrice,
            player: playerName
        });
    } catch (e) { console.error(e); }
}

function generateBingoCard() {
    const card = Array.from({ length: 3 }, () => Array(9).fill(null));
    const columns = Array.from({ length: 9 }, (_, i) => {
        const start = i === 0 ? 1 : i * 10;
        const end = i === 8 ? 90 : (i * 10) + 9;
        const nums = [];
        for (let n = start; n <= end; n++) nums.push(n);
        return nums.sort(() => Math.random() - 0.5);
    });
    for (let r = 0; r < 3; r++) {
        let colsToFill = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5).slice(0, 5);
        colsToFill.forEach(c => { if (columns[c].length > 0) card[r][c] = columns[c].pop(); });
    }
    return card;
}

function renderCard(cardData, index) {
    const cardWrapper = document.createElement('div');
    cardWrapper.style.marginBottom = '30px';
    cardWrapper.style.animation = 'fadeIn 0.5s ease-out';
    const cardTitle = document.createElement('div');
    cardTitle.innerHTML = `<span style="color: var(--accent-gold); font-weight: 800;">CARTELLA #${index + 1}</span>`;
    cardTitle.style.marginBottom = '10px';
    cardTitle.style.fontSize = '0.8rem';
    cardWrapper.appendChild(cardTitle);
    const cardDiv = document.createElement('div');
    cardDiv.className = 'glass bingo-card';
    cardDiv.id = `card-${index}`;

    cardData.flat().forEach((num, i) => {
        const cell = document.createElement('div');
        cell.className = num ? 'bingo-cell' : 'bingo-cell empty';
        cell.textContent = num || '';
        if (num) {
            cell.dataset.num = num;
            cell.addEventListener('click', () => {
                if (extractedNumbers.includes(parseInt(num))) {
                    cell.classList.toggle('marked');
                } else {
                    showModal({ title: "Non estratto", message: `Il numero ${num} non è uscito.`, icon: "fas fa-lock" });
                }
            });
        }
        cardDiv.appendChild(cell);
    });
    cardWrapper.appendChild(cardDiv);
    cardsArea.appendChild(cardWrapper);
}

function autoCheck(lastNumber) {
    if (!autoCheckToggle.checked) return;
    document.querySelectorAll(`.bingo-cell[data-num="${lastNumber}"]`).forEach(cell => {
        if (!cell.classList.contains('marked')) {
            cell.classList.add('marked');
        }
    });
}

window.declareWin = async function(type) {
    // 0. CONTROLLO GERARCHIA PREMI
    const prizeOrder = ['ambo', 'terno', 'quaderna', 'cinquina', 'tombola'];
    const currentIndex = prizeOrder.indexOf(type);
    const higherPrizeWon = prizeOrder.slice(currentIndex + 1).some(p => window.currentWonPrizes && window.currentWonPrizes[p]);
    
    if (higherPrizeWon) {
        showModal({ title: "Premio Scaduto", message: `Non è più possibile fare ${type.toUpperCase()} perché è già stato vinto un premio superiore.`, icon: "fas fa-history" });
        return;
    }

    // 1. VERIFICA AUTOMATICA E IDENTIFICAZIONE NUMERI VINCENTI
    let winningNumbers = []; // FIX: Re-aggiunta variabile mancante
    const requiredCount = { ambo: 2, terno: 3, quaderna: 4, cinquina: 5, tombola: 15 };
    const needed = requiredCount[type];

    for (const card of myCards) {
        if (type === 'tombola') {
            const allExtracted = card.flat().filter(n => n && extractedNumbers.includes(parseInt(n)));
            if (allExtracted.length >= 15) { winningNumbers = allExtracted; break; }
        } else {
            for (const row of card) {
                const rowExtracted = row.filter(n => n && extractedNumbers.includes(parseInt(n)));
                if (rowExtracted.length >= needed) { winningNumbers = rowExtracted; break; }
            }
        }
        if (winningNumbers.length > 0) break;
    }

    if (winningNumbers.length === 0) {
        showModal({ title: "Non ancora!", message: `Ti mancano numeri per ${type.toUpperCase()}.`, icon: "fas fa-times" });
        return;
    }

    try {
        await addDoc(collection(db, "tombola_premium", roomId, "notifications"), {
            type: type,
            player: playerName,
            timestamp: Date.now(),
            numbers: winningNumbers,
            lastNumber: parseInt(lastNumberMobile.textContent) || 0
        });
        showModal({ title: "Inviato!", message: `Controlliamo il tuo ${type.toUpperCase()}...`, icon: "fas fa-trophy" });
    } catch (e) { showModal({ title: "Errore", message: e.message }); }
}

function showGameOverSummary(wonPrizes, totalPot) {
    confetti({ particleCount: 150, spread: 60, origin: { y: 0.7 } });
    let summaryHtml = "<div style='text-align: left; margin-top: 15px; font-size: 0.85rem;'>";
    Object.keys(prizeDistribution).forEach(p => {
        const winners = wonPrizes[p] ? Object.keys(wonPrizes[p]) : [];
        if (winners.length > 0) {
            const val = (totalPot * prizeDistribution[p]) / winners.length;
            summaryHtml += `<p><strong>${p.toUpperCase()}:</strong> ${winners.join(", ")} (€ ${val.toFixed(2)})</p>`;
        }
    });
    summaryHtml += "</div>";
    showModal({ title: "PARTITA CONCLUSA!", message: "Il gioco è terminato.", icon: "fas fa-flag-checkered" });
    document.getElementById('modal-message').innerHTML += summaryHtml;
}

window.updateTotalDisplay = function() {
    totalCostDisplay.textContent = `Totale: € ${(selectedCount * currentPrice).toFixed(2)}`;
}

window.logoutPlayer = function() {
    showModal({
        title: "Esci dalla partita",
        message: "Vuoi davvero uscire? Perderai le tue cartelle attuali.",
        showCancel: true,
        confirmText: "SÌ, ESCI",
        onConfirm: () => {
            localStorage.clear();
            location.reload();
        }
    });
}

window.selectPurchase = function(count) {
    selectedCount = count;
    document.querySelectorAll('.buy-option').forEach(btn => {
        btn.style.background = parseInt(btn.textContent) === count ? 'var(--accent-gold)' : 'rgba(255, 255, 255, 0.1)';
        btn.style.color = parseInt(btn.textContent) === count ? 'var(--bg-dark)' : '#fff';
    });
    updateTotalDisplay();
    btnConfirm.style.display = 'block';
}
