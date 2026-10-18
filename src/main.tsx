import { moodLabels, type MusicMood } from "./music";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { inspectFile } from "./metadata";
import { makePlan, totalDuration, type Asset, type PhotoDuration } from "./model";
import { checkSupport, exportMovie } from "./exporter";
import "./style.css";
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(Number.isInteger(seconds) ? 0 : 1).padStart(Number.isInteger(seconds) ? 2 : 4, "0")}`;
const inputDate = (n: number) =>
  new Date(n - new Date(n).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
function App() {
  const [assets, setAssets] = useState<Asset[]>([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [support, setSupport] = useState<string | null | undefined>(undefined),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(0),
    [status, setStatus] = useState("");
  const [result, setResult] = useState<{
    url: string;
    blob: Blob;
    musicMood?: MusicMood;
    animatedPhotos: number;
    stillPhotos: number;
  } | null>(null);
  const [photoDuration, setPhotoDuration] = useState<PhotoDuration>(1);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const active = useRef(false);
  useEffect(() => {
    checkSupport().then(setSupport);
    return () => {
      controller.current?.abort();
    };
  }, []);
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  const valid = assets.filter((a) => !a.error);
  const unresolved = valid.filter((a) => a.date === null || !a.confirmed);
  let plan: ReturnType<typeof makePlan> = [];
  try {
    if (!unresolved.length) plan = makePlan(assets, photoDuration);
  } catch {}
  const length = totalDuration(plan);
  const photos = valid.filter((a) => a.kind === "photo").length;
  const estimate = valid.reduce(
    (n, a) => n + (a.kind === "photo" ? photoDuration : Math.min(4, a.duration)),
    0,
  );
  const sorted = [...assets].sort(
    (a, b) => (a.date ?? Infinity) - (b.date ?? Infinity),
  );
  async function addFiles(files: FileList | null) {
    if (!files?.length || active.current) return;
    active.current = true;
    setLoading(true);
    setError("");
    setOrderConfirmed(false);
    setResult(null);
    const incoming: Asset[] = [];
    try {
      for (const file of Array.from(files)) {
        setStatus(`${incoming.length + 1} / ${files.length} 素材を確認中`);
        incoming.push(await inspectFile(file));
      }
      setAssets((old) => [...old, ...incoming]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
      active.current = false;
      setStatus("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function changeDate(id: string, value: string) {
    setResult(null);
    setOrderConfirmed(false);
    setAssets((old) =>
      old.map((a) =>
        a.id === id
          ? {
              ...a,
              date: value ? new Date(value).getTime() : null,
              confirmed: !!value,
              dateSource: "手動指定（この端末の時差）",
            }
          : a,
      ),
    );
  }
  async function create() {
    if (active.current || !orderConfirmed || unresolved.length || !plan.length)
      return;
    active.current = true;
    controller.current = new AbortController();
    setBusy(true);
    setResult(null);
    setError("");
    setProgress(0);
    let wake: { release: () => Promise<void> } | undefined;
    try {
      try {
        wake = await (
          navigator as Navigator & {
            wakeLock?: {
              request: (
                type: string,
              ) => Promise<{ release: () => Promise<void> }>;
            };
          }
        ).wakeLock?.request("screen");
      } catch {}
      let animatedPhotos = 0,
        stillPhotos = 0;
      let musicMood: MusicMood | undefined;
      const blob = await exportMovie(plan, {
        onMusicMood: (mood) => { musicMood = mood; },
        bgm: true,
        onPhotoMotion: (animated) => {
          if (animated) animatedPhotos++;
          else stillPhotos++;
        },
        signal: controller.current.signal,
        onProgress: (n, s) => {
          setProgress(n);
          setStatus(s);
        },
      });
      setResult({
        blob,
        musicMood,
        url: URL.createObjectURL(blob),
        animatedPhotos,
        stillPhotos,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.name === "AbortError" ? "" : "書き出し失敗："}${e.message}`
          : "書き出しに失敗しました。素材を減らして再試行してください。",
      );
    } finally {
      await wake?.release().catch(() => {});
      setBusy(false);
      active.current = false;
      setStatus("");
    }
  }
  async function share() {
    if (!result) return;
    const file = new File([result.blob], "AI-Travel-Movie.mp4", {
      type: "video/mp4",
    });
    try {
      if (navigator.canShare?.({ files: [file] }))
        await navigator.share({ files: [file], title: "AI Travel Movie" });
      else
        setError(
          "このブラウザでは動画の共有が使えません。「MP4をダウンロード」で保存してください。",
        );
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setError("共有できませんでした。MP4をダウンロードしてください。");
    }
  }
  return (
    <main>
      <nav>
        <a href="#">
          ✦ <b>AI Travel Movie</b>
        </a>
        <span className="local">● 端末内で編集</span>
      </nav>
      <header>
        <span className="eyebrow">YOUR JOURNEY, BEAUTIFULLY TOGETHER</span>
        <h1>
          旅の思い出を、
          <br />
          <span>ひとつの映画に。</span>
        </h1>
        <p>
          写真と動画を選ぶだけ。
          <br className="mobile" /> あの日の順番で、最大3分のダイジェストへ。
        </p>
      </header>
      <section className="workspace">
        <div className="section-head">
          <span className="step">01</span>
          <div>
            <h2>旅の素材を選ぶ</h2>
            <p>写真も動画も、まとめてどうぞ。</p>
          </div>
          <span className="pill">無料・アップロードなし</span>
        </div>
        <button
          className="upload"
          onClick={() => fileInput.current?.click()}
          disabled={busy || loading}
        >
          <span className="upload-icon">＋</span>
          <strong>写真・動画を選択</strong>
          <span>JPEG・PNG・HEIC・MOV・MP4</span>
          <small>HEIC・動画の対応はお使いの端末によります</small>
        </button>
        <input
          ref={fileInput}
          aria-label="写真・動画を選択"
          hidden
          type="file"
          multiple
          accept="image/jpeg,image/png,image/heic,image/heif,video/mp4,video/quicktime,.heic,.heif,.mov,.mp4"
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="summary">
          <div>
            <strong>
              {photos}
              <small>枚</small>
            </strong>
            <span>写真</span>
          </div>
          <div>
            <strong>
              {valid.length - photos}
              <small>本</small>
            </strong>
            <span>動画</span>
          </div>
          <div>
            <strong>{time(Math.min(180, estimate))}</strong>
            <span>完成尺の目安</span>
          </div>
        </div>
        <label className="photo-duration">
          写真の表示時間（全体共通）
          <select
            value={photoDuration}
            disabled={busy || loading}
            onChange={(e) => {
              setPhotoDuration(Number(e.target.value) as PhotoDuration);
              setResult(null);
            }}
          >
            <option value="1">1秒</option>
            <option value="1.5">1.5秒</option>
            <option value="2">2秒</option>
          </select>
        </label>
        <p className="hint">すべての写真に同じ秒数を使います。写真全体にゆっくりしたズームやPANをランダムに付けます。縦横比を保って画面いっぱいに拡大するため、写真の上下・左右の一部が切り取られます。</p>
        <p className="hint"><strong>BGMは自動で付きます（無料）。</strong>写真の色合い・明るさから雰囲気を選び、端末内で生成します。動画の元音声も残し、その区間ではBGMを控えめにします。</p>
        {loading && <p role="status">{status}</p>}
        {assets.length > 0 && (
          <div className="timeline">
            <div className="section-head">
              <span className="step">02</span>
              <div>
                <h2>撮影日時と順番を確認</h2>
                <p>古い順に編集します。ファイル名・更新日時は使いません。</p>
              </div>
            </div>
            <p className="hint">
              時差のないEXIFは、撮影地の時差に直して日時を指定してください。入力欄はこの端末の時差（
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
              ）で表示します。QuickTimeの日時は保存日時の場合があるため確認が必要です。
            </p>
            {sorted.map((a) => (
              <article
                className={`asset ${a.error ? "invalid" : a.date === null || !a.confirmed ? "needs-confirmation" : ""}`}
                key={a.id}
              >
                {a.thumbnail ? (
                  <img src={a.thumbnail} alt="" />
                ) : (
                  <span className="media-icon">
                    {a.kind === "video" ? "▷" : "▧"}
                  </span>
                )}
                <div className="asset-info">
                  <strong>{a.file.name}</strong>
                  {!a.error && (a.date === null || !a.confirmed) && (
                    <p className="confirmation-alert">要確認：この素材の撮影日時を入力・確認してください</p>
                  )}
                  {a.error ? (
                    <p role="alert">{a.error}</p>
                  ) : (
                    <>
                      <small>
                        {a.kind === "photo"
                          ? `写真 · ${photoDuration}秒`
                          : `動画 · ${time(a.duration)} → 冒頭${Math.min(4, a.duration).toFixed(1)}秒`}{" "}
                        · {a.dateSource}
                      </small>
                      <label>
                        撮影日時
                        <input
                          aria-label={`${a.file.name}の撮影日時`}
                          type="datetime-local"
                          step="1"
                          disabled={busy || loading}
                          value={
                            a.date !== null
                              ? inputDate(a.date)
                              : (a.localDate ?? "")
                          }
                          onChange={(e) => changeDate(a.id, e.target.value)}
                        />
                      </label>
                      {!a.confirmed && (
                        <button
                          className="text-button confirmation-action"
                          disabled={busy || loading}
                          onClick={() => {
                            if (a.date !== null) {
                              setAssets((old) =>
                                old.map((x) =>
                                  x.id === a.id ? { ...x, confirmed: true } : x,
                                ),
                              );
                              setOrderConfirmed(false);
                            } else if (a.localDate) {
                              changeDate(a.id, a.localDate);
                            }
                          }}
                        >
                          {a.date !== null
                            ? "この日時を確認"
                            : a.localDate
                              ? "表示日時をこの端末の時差として確定"
                              : "日時を入力してください"}
                        </button>
                      )}
                    </>
                  )}
                </div>
                <button
                  className="remove"
                  aria-label={`${a.file.name}を削除`}
                  disabled={busy || loading}
                  onClick={() => {
                    setAssets((old) => old.filter((x) => x.id !== a.id));
                    setOrderConfirmed(false);
                    setResult(null);
                  }}
                >
                  ×
                </button>
              </article>
            ))}
            {unresolved.length > 0 && (
              <p className="notice confirmation-alert" role="alert">
                {unresolved.length}
                件の撮影日時が未確認です。赤い「要確認」の素材を確認してください。
              </p>
            )}
            {valid.length > 0 && unresolved.length === 0 && (
              <>
                <label className="confirmation">
                  <input
                    type="checkbox"
                    checked={orderConfirmed}
                    disabled={busy || loading}
                    onChange={(e) => setOrderConfirmed(e.target.checked)}
                  />
                  表示された撮影順で編集する
                </label>
                <p className="hint">
                  使用予定 {plan.length}素材 · {time(length)}
                  {length < 180
                    ? "。素材が少ないため短い動画になります。繰り返しません。"
                    : "。多い素材は旅行全体から時間順に間引きます。"}
                </p>
              </>
            )}
          </div>
        )}
        {support && (
          <p className="notice" role="status">
            {support}
          </p>
        )}
        <button
          className="primary"
          onClick={create}
          disabled={
            busy ||
            loading ||
            !orderConfirmed ||
            !plan.length ||
            support !== null
          }
        >
          {busy ? "動画を作成しています…" : "3分動画を作成"} <span>↗</span>
        </button>
        <p className="under-button">720p · MP4 · 最大180秒 · 約60MBが目安</p>
        {busy && (
          <div className="progress" role="status">
            <progress value={progress} max="1" />
            <p>
              {Math.round(progress * 100)}% · {status}
            </p>
            <small>
              この画面を開いたままお待ちください。素材・端末により数分以上かかります。
            </small>
            <button
              className="text-button"
              onClick={() => controller.current?.abort()}
            >
              作成を中止
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <section className="result">
            <span className="eyebrow">YOUR MOVIE IS READY</span>
            <h2>旅の映画ができました。</h2>
            <video src={result.url} controls playsInline />
            <p>BGM：{result.musicMood ? `${moodLabels[result.musicMood]}（写真の色合いから自動選択）` : "なし"}</p>
            <p>{(result.blob.size / 1000000).toFixed(1)} MB · MP4</p>
            {result.animatedPhotos + result.stillPhotos > 0 && (
              <p>
                写真：ズーム・PAN {result.animatedPhotos}枚
              </p>
            )}
            <button className="primary" onClick={share}>
              共有して写真に保存
            </button>
            <a
              className="download"
              href={result.url}
              download="AI-Travel-Movie.mp4"
            >
              MP4をダウンロード ↓
            </a>
            <p className="hint">
              iPhoneでは共有シートの「ビデオを保存」を選んでください。表示されない場合は「ファイルに保存」後、ファイルアプリで動画を開き、共有
              →「ビデオを保存」。Webから写真アプリへ直接保存はできません。
            </p>
            <button
              className="text-button"
              onClick={() => {
                setResult(null);
                setError("");
              }}
            >
              再編集する
            </button>
          </section>
        )}
      </section>
      <section className="features">
        <div>
          <span>◷</span>
          <h3>思い出の順番を大切に</h3>
          <p>
            撮影日時を確認して、
            <br />
            旅の始まりから終わりまで。
          </p>
        </div>
        <div>
          <span>⌁</span>
          <h3>あなたの端末だけで</h3>
          <p>
            写真と動画は送信しません。
            <br />
            アカウントも課金も不要。
          </p>
        </div>
        <div>
          <span>▱</span>
          <h3>そのまま、持ち歩こう</h3>
          <p>
            軽い720pのMP4で、
            <br />
            保存もシェアもシンプルに。
          </p>
        </div>
      </section>
      <footer>
        <p>基本編集版 · 写真全体のズーム・PANに対応</p>
        <p>
          無料の自動BGMに対応。AI選別・見どころ抽出・AI音楽生成は未実装です。
          <br />
          写真は全体共通で1秒・1.5秒・2秒から選べます。写真全体に小さなズーム・PANを付け、黒帯が出ないよう縦横比を保って拡大・トリミングします。動画は冒頭最大4秒です。
        </p>
        <small>AI Travel Movie — Made for your memories.</small>
        <a href="./licenses/NOTICE.txt" className="license-link">
          オープンソースライセンス
        </a>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
