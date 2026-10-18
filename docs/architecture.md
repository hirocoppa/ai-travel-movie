# 実装境界と将来の拡張

## Phase 1のデータ経路

File選択 → 1件ずつ互換性・メタデータ確認 → 撮影時刻をユーザー確認 → 純粋関数makePlan → WebCodecs + Canvas + 1カットずつのOfflineAudioContext → MediabunnyのMP4多重化 → Blobプレビュー・共有。

Fileの原本は変更しない。解析・書き出しはブラウザ内。外部API・CDN・素材送信はない。公開サイトから取得するのはアプリと同梱依存コードのみ。閉じると素材・完成動画のメモリは失われるため、完成後に保存する。

`Asset.date`はUTC epoch milliseconds。時差付きEXIFを優先し、時差なしは確認待ちにする。MOVはApple撮影時刻の時差を優先、mvhdのUTC作成日時は確認が必要。日時欠落をFile.lastModifiedやファイル名で補わない。ユーザーは日時を入力することで順番を指定できる。明示的な順番だけを入力するUIは今後の改善。

`Cut`は素材、素材内開始秒、使用秒数、実際の撮影時刻を保持。Phase 1は開始秒0のみ。将来の複数カット抽出では `capturedAt = asset.date + start * 1000` でソートし直す。品質ランキングで順序を変えない。

映像は30fpsで明示的なタイムスタンプを付ける。AACはネイティブ優先、不在なら同梱の無料WASM。AACのパディングをエンコード済みパケットの表示時間から除き、最終MP4の長さを編集計画と合わせる。動画の音声は該当区間だけデコードし、短いOfflineAudioContextで48kHzステレオに揃える。BGMオン時は写真の色合いで雰囲気を選び、music.tsで全体の絶対時刻から1カットずつ合成・ミックス。動画の元音声トラックがある区間ではBGMを下げる。BGMオフ時の写真は無音。素材内の音声・映像は同じ基準タイムスタンプで切る。

ffmpeg.wasm全体は導入していない。初回ダウンロード、メモリ負荷、Safariでの並列実行やSharedArrayBufferに必要なヘッダーを避け、静的なGitHub Pagesで動かすため。AAC補完の小さなWASMだけを必要時に使う。

## Phase 2

重複候補を端末内の縮小画像ハッシュで検出。推測で削除せず選別理由を表示する。映像品質スコア・手ブレ・動作候補も端末内で計算し、最終的には撮影時刻順に戻す。音声の発話検出・滑らかなBGMダッキング・ピークリミッターは別のAudioMixerモジュールにする。人物分離が不確実ならごく軽い通常パンへ落とす。現在はMediaPipeの端末内人物マスクを保守的に拡張して固定し、背景だけを数px動かす。人物マスクに十分な確信が得られなければ静止表示する。背景の生成やインペインティングは行わない。

## Phase 3：Macのローカル音楽生成

想定インターフェース（未実装）：MusicProvider.generate({mood,duration,seed,signal}) → Promise<{audio:Blob,license:string,source:string}>。無料素材の選曲、Macで生成したファイルの読み込み、将来のローカル生成を別実装にする。「AI生成」「無料素材」「ユーザー持ち込み」を画面で区別する。

最初のMac連携は、Mac側で単独実行 → WAV/M4Aを書き出し → AirDrop等でiPhoneへ転送 → 明示的なファイル選択で取り込む方式を推奨する。写真・動画をMacへ送る必要はない。GitHub PagesからローカルHTTPサービスへ接続する方式はMixed Content / CORS / ローカルネットワーク許可の制約があるため、無条件に使えるとはしない。

## Phase 4：ネイティブ化

UI・編集計画を再利用し、MediaLibraryProvider（PHPicker / Android Photo Picker）、Exporter（AVFoundation / Android MediaCodec）、MovieSaver（PhotoKit許可後に保存）を交換する。Safariの共有シートは現行の保存手段。ネイティブ版ではバックグラウンド処理・ストレージへのストリーム出力・HDR扱いを個別に検証する。ネイティブ実装はまだない。
