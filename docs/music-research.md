# 無料音楽生成の調査

確認日：2026-10-18（日本時間）。Phase 1にはBGMを一切同梱しておらず、AI音楽生成も実装していません。画面でも未実装と表示します。

## MusicGen / AudioCraft

公式ソースを確認：

- https://github.com/facebookresearch/audiocraft
- https://github.com/facebookresearch/audiocraft/blob/main/docs/MUSICGEN.md
- https://github.com/facebookresearch/audiocraft/blob/main/LICENSE
- https://github.com/facebookresearch/audiocraft/blob/main/LICENSE_weights

コードはMITですが、モデル重みは **CC BY-NC 4.0（非商用限定）**。無料モデルでも商用アプリや広告付き利用へ無条件に採用できるわけではありません。出力・利用条件についてもモデルの条件を確認して採用を判断する必要があります。

公式説明ではPython / PyTorchとGPUによるローカル推論を想定し、medium（約15億パラメータ）はGPUメモリ16GB以上を要求。小さいGPUやsmallモデルは短い音楽向けです。iPhone Safariで3分を生成する用途の標準ブラウザ実装ではなく、モデルも同梱しません。MacのApple Silicon / MPSでの動作・速度はこの環境では未検証で、CUDA向け手順をそのままMac対応と表記しません。

まず非商用のローカル実験候補とし、本番の既定BGMには採用しません。無料APIとして外部ホストに写真を送る方式や有料GPUは使いません。

## 代替と導入条件

初期代替は、権利情報を確認したCC0 / 商用利用可能な無料インストゥルメンタルをアプリ内に同梱し、雰囲気に応じて端末内で選曲する方式。現時点では音源の権利確認・同梱は未実施です。「AI生成」と偽って既存曲を再生しません。

Mac連携は生成モデルのライセンス・対象Macでの動作を確認してから実装します。写真・動画を送らず、ユーザーが雰囲気（海・街・自然など）を選択し、生成した音源だけをファイルとして渡す方式ならプライバシーとWebの制約を両立しやすくなります。ランダムseedと音源差し替えでBGMのみ再生成する境界を設けます（architecture.md参照）。自動的な旅行内容分類や生成モデル実行は未実装です。
