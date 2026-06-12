const videoElement = document.getElementById('video-stream');
const canvas = document.getElementById('camera-canvas');
const ctx = canvas.getContext('2d');
const timeDisplay = document.getElementById('current-time-display');

const shutterBtn = document.getElementById('shutter-btn');
const flashEffect = document.getElementById('flash-effect');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const galleryPreviewBtn = document.getElementById('gallery-preview-btn');
const galleryThumb = document.getElementById('gallery-thumb');

const galleryModal = document.getElementById('gallery-modal');
const closeGalleryBtn = document.getElementById('close-gallery-btn');
const galleryGrid = document.getElementById('gallery-grid');
const emptyGalleryMsg = document.getElementById('empty-gallery-msg');

const photoModal = document.getElementById('photo-modal');
const closePhotoBtn = document.getElementById('close-photo-btn');
const photoPreviewImg = document.getElementById('photo-preview-img');
const downloadPhotoBtn = document.getElementById('download-photo-btn');
const deletePhotoBtn = document.getElementById('delete-photo-btn');

let currentStream = null;
let useFrontCamera = false;
let animationId = null;

// 画像を保存する配列
let photos = [];
let currentViewingIndex = -1;

// 初期化
async function initCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("エラー: カメラAPIがサポートされていません。アプリ作成サービス側でカメラの権限が有効になっていないか、セキュリティ制限がかかっています。");
        return;
    }

    const constraints = {
        video: {
            facingMode: useFrontCamera ? 'user' : 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        },
        audio: false
    };

    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = currentStream;
        
        // スマホのブラウザ/WebViewで自動再生ポリシーを回避するため明示的に再生
        videoElement.play().catch(e => console.error("Video play failed:", e));

        // 描画ループをすぐに開始（時計などのUIを動かすため）
        if (!animationId) drawFrame();

        // ビデオのメタデータが読み込まれたら再度サイズを合わせる
        videoElement.onloadedmetadata = () => {
            canvas.width = videoElement.videoWidth || 1080;
            canvas.height = videoElement.videoHeight || 1920;
        };
        
        // 一部WebViewではイベントが発火しない対策として定期的にチェック
        let checkCount = 0;
        const checkVideo = setInterval(() => {
            if (videoElement.videoWidth > 0 && canvas.width !== videoElement.videoWidth) {
                canvas.width = videoElement.videoWidth;
                canvas.height = videoElement.videoHeight;
            }
            checkCount++;
            if (checkCount > 20) clearInterval(checkVideo); // 10秒で諦める
        }, 500);
    } catch (err) {
        console.error("カメラへのアクセスに失敗しました:", err);
        alert("カメラへのアクセスに失敗しました。\nエラー: " + err.name + " - " + err.message + "\n※スマートフォンの設定でアプリに「カメラ」の権限が許可されているか確認してください。");
    }
}

// 毎フレームの描画処理
function drawFrame() {
    // videoWidthが0より大きい場合のみ映像を描画（準備完了の証拠）
    if (!videoElement.paused && !videoElement.ended && videoElement.videoWidth > 0) {
        // キャンバスをクリア
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 1. レトロフィルターの設定（CSS Filter APIを使用）
        // セピア、コントラスト強め、少し明るさを落としてオレンジ色味（saturate/hue-rotate）を加える
        ctx.filter = "sepia(0.6) contrast(1.2) brightness(0.9) saturate(1.4) hue-rotate(-10deg)";
        
        // 鏡面反転（インカメラの場合）
        if (useFrontCamera) {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(videoElement, -canvas.width, 0, canvas.width, canvas.height);
            ctx.restore();
        } else {
            // 普通に描画
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        }
        
        // フィルターをリセットして次の描画に影響させない
        ctx.filter = "none";
        
        // 2. 光の漏れ（ライトリーク）効果の描画
        drawLightLeaks();

        // 3. タイムスタンプの描画
        drawTimestamp();
    }
    
    // UIの時計も更新
    updateClock();
    
    animationId = requestAnimationFrame(drawFrame);
}

// ライトリーク（光の漏れ）エフェクトの描画
function drawLightLeaks() {
    // 古いフィルムのようなランダムなオレンジ/赤系の光を端に描画
    ctx.globalCompositeOperation = 'screen'; // 光を重ねるブレンドモード
    
    // 時間経過でゆっくり変化するグラデーション
    const time = Date.now() * 0.001;
    const xOffset = Math.sin(time) * 50;
    
    // 左端の光
    const grad1 = ctx.createRadialGradient(
        0 + xOffset, canvas.height * 0.3, 0,
        0, canvas.height * 0.3, canvas.width * 0.6
    );
    grad1.addColorStop(0, 'rgba(255, 80, 0, 0.4)');
    grad1.addColorStop(1, 'rgba(255, 80, 0, 0)');
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 右下の光
    const grad2 = ctx.createRadialGradient(
        canvas.width, canvas.height * 0.8, 0,
        canvas.width, canvas.height * 0.8, canvas.width * 0.5
    );
    grad2.addColorStop(0, 'rgba(255, 30, 0, 0.3)');
    grad2.addColorStop(1, 'rgba(255, 30, 0, 0)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.globalCompositeOperation = 'source-over'; // 元に戻す
}

// 日付と時間のタイムスタンプを描画
function drawTimestamp() {
    const now = new Date();
    // 例: "88 12 24" (年 月 日) のようなレトロな表記
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    const timestamp = `'${year} ${month} ${date}   ${hours}:${minutes}`;
    
    // 文字のスタイル設定（オレンジ色のデジタル/フィルム風フォント）
    const fontSize = Math.floor(canvas.width * 0.05); // 画面サイズに比例
    ctx.font = `bold ${fontSize}px 'Share Tech Mono', monospace`;
    ctx.fillStyle = '#ff8800'; // 濃いオレンジ色
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    
    // 少しぼかしを入れてフィルムに焼き付けた感を出す
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    const padding = fontSize;
    ctx.fillText(timestamp, canvas.width - padding, canvas.height - padding);
    
    // シャドウリセット
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

// UIの時計更新
function updateClock() {
    const now = new Date();
    timeDisplay.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// 写真撮影
function takePhoto() {
    // フラッシュエフェクト
    flashEffect.classList.add('active');
    setTimeout(() => {
        flashEffect.classList.remove('active');
    }, 100);

    // キャンバスから画像をJPEGとして取得
    const dataURL = canvas.toDataURL('image/jpeg', 0.9);
    
    // ギャラリーに追加
    photos.unshift(dataURL); // 先頭に追加
    
    // サムネイル更新
    galleryThumb.src = dataURL;
    
    // カメラのシャッター音を鳴らす（オプション）
    // const audio = new Audio('shutter.mp3');
    // audio.play().catch(e => {});
}

// ギャラリーのレンダリング
function renderGallery() {
    galleryGrid.innerHTML = '';
    
    if (photos.length === 0) {
        emptyGalleryMsg.style.display = 'block';
    } else {
        emptyGalleryMsg.style.display = 'none';
        
        photos.forEach((photoUrl, index) => {
            const img = document.createElement('img');
            img.src = photoUrl;
            img.className = 'gallery-item';
            img.onclick = () => openPhotoModal(index);
            galleryGrid.appendChild(img);
        });
    }
}

// モーダル操作
function openGalleryModal() {
    renderGallery();
    galleryModal.classList.remove('hidden');
}

function closeGallery() {
    galleryModal.classList.add('hidden');
}

function openPhotoModal(index) {
    currentViewingIndex = index;
    photoPreviewImg.src = photos[index];
    photoModal.classList.remove('hidden');
}

function closePhoto() {
    photoModal.classList.add('hidden');
    currentViewingIndex = -1;
}

function downloadCurrentPhoto() {
    if (currentViewingIndex >= 0) {
        const link = document.createElement('a');
        link.download = `retro_photo_${Date.now()}.jpg`;
        link.href = photos[currentViewingIndex];
        link.click();
    }
}

function deleteCurrentPhoto() {
    if (currentViewingIndex >= 0 && confirm('この写真を削除しますか？')) {
        photos.splice(currentViewingIndex, 1);
        closePhoto();
        renderGallery();
        
        // サムネイルの更新
        if (photos.length > 0) {
            galleryThumb.src = photos[0];
        } else {
            galleryThumb.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='none'><rect width='100' height='100' fill='%23333'/></svg>";
        }
    }
}

// イベントリスナー
shutterBtn.addEventListener('click', takePhoto);
switchCameraBtn.addEventListener('click', () => {
    useFrontCamera = !useFrontCamera;
    initCamera();
});

galleryPreviewBtn.addEventListener('click', openGalleryModal);
closeGalleryBtn.addEventListener('click', closeGallery);
closePhotoBtn.addEventListener('click', closePhoto);

downloadPhotoBtn.addEventListener('click', downloadCurrentPhoto);
deletePhotoBtn.addEventListener('click', deleteCurrentPhoto);

// 起動時にカメラを初期化
initCamera();
