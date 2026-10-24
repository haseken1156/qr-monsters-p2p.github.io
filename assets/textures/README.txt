テクスチャの入れ替え（コード編集不要）

このフォルダ内に、下の名前のPNG画像を入れてください。
ゲームを公開している場合は、画像も同じ場所へアップロードしてからページを再読み込みしてください。
PNGがあればPNGが優先され、なければ同名の同梱SVGを使います。元のSVGは消さなくて大丈夫です。
SVG自体を同名で差し替える方法も使えます（PNGが残っていればPNG優先です）。

背景：
backgrounds/page.png        ゲーム全体の背景
backgrounds/battle.png      バトルのステージ背景
backgrounds/partner.png     相棒カードの背景

技エフェクト：
effects/fire.png            炎の技
effects/water.png           水の技
effects/grass.png           草の技
effects/lightning.png       雷の技
effects/earth.png           土の技
effects/normal.png          無属性の技
effects/heal.png            癒しの光
effects/guard.png           ガード

技エフェクトは背景透過の正方形PNG（例：512×512）がおすすめです。ドット絵の画像1枚に、ゲーム側で四角い粒と十字のキラキラ、段階的な動きを加えます。画像そのものにアニメーションを作る必要はありません。
背景は正方形でも横長でも使えます。表示枠に合わせて拡大・切り抜きされます。
ファイル名は半角小文字にしてください。JPGを名前だけ.pngに変えるのではなく、PNG形式で書き出してください。
同じ名前で差し替えたPNGは再読み込み時に取得し直します。開いたままの画面には反映されません。
好きなファイル名を自動で探す機能ではなく、上記の決まった場所・名前を使います。

モンスター画像：
一つ上のassets/monsters/0.png〜19.pngを同名で置き換えます。
番号と種族の対応はjs/engine.jsのSPECIES配列の先頭から0〜19です。

公開時はpublicの中身だけをアップロードしてください。developer-privateは公開しないでください。
