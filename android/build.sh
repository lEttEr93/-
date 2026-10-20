#!/data/data/com.termux/files/usr/bin/bash
# 项目专用构建脚本：基于 apk-builder，增加 assets/ 打包支持
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="/data/data/com.termux/files/home/.pi/agent/skills/apk-builder"
ANDROID_JAR="$SKILL_DIR/platform/android.jar"
APK_NAME="大学食草路"
OUTPUT_DIR="$PROJECT_DIR/output"
BUILD_DIR="$PROJECT_DIR/.build"

if [ ! -f "$ANDROID_JAR" ]; then echo "缺少 android.jar"; exit 1; fi

rm -rf "$BUILD_DIR" "$OUTPUT_DIR"
mkdir -p "$BUILD_DIR"/{compiled,gen,obj,dex} "$OUTPUT_DIR"

echo "[1/6] 编译资源 (aapt2 compile)"
aapt2 compile -o "$BUILD_DIR/compiled" --dir "$PROJECT_DIR/res/"

echo "[2/6] 链接资源 + assets (aapt2 link)"
ASSET_ARG=""
if [ -d "$PROJECT_DIR/assets" ]; then ASSET_ARG="-A $PROJECT_DIR/assets"; fi
aapt2 link -I "$ANDROID_JAR" \
    --manifest "$PROJECT_DIR/AndroidManifest.xml" \
    --java "$BUILD_DIR/gen" \
    $ASSET_ARG \
    -o "$BUILD_DIR/base.apk" \
    "$BUILD_DIR"/compiled/*.flat

echo "[3/6] 编译 Java (ecj)"
JAVA_FILES=$(find "$PROJECT_DIR/src" "$BUILD_DIR/gen" -name "*.java" 2>/dev/null | tr '\n' ' ')
ecj -cp "$ANDROID_JAR:$BUILD_DIR/gen" -d "$BUILD_DIR/obj" $JAVA_FILES

echo "[4/6] 转换 DEX (d8)"
CLASS_FILES=$(find "$BUILD_DIR/obj" -name "*.class" 2>/dev/null | tr '\n' ' ')
d8 --lib "$ANDROID_JAR" --output "$BUILD_DIR/dex" $CLASS_FILES

echo "[5/6] 打包 APK"
cp "$BUILD_DIR/base.apk" "$BUILD_DIR/unsigned.apk"
cd "$BUILD_DIR/dex" && zip -q ../unsigned.apk classes.dex
cd "$PROJECT_DIR"
# 确认 assets 已进入 APK（aapt2 -A 已打包，供 WebView 读取）
unzip -l "$BUILD_DIR/unsigned.apk" | grep -q "assets/index.html" || { echo "!! assets 未打包"; exit 1; }

echo "[6/6] 签名 APK"
KEYSTORE="$SKILL_DIR/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkey -v -keystore "$KEYSTORE" -alias debug -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass android -keypass android \
    -dname "CN=APK Builder, OU=Dev, O=Termux, L=City, ST=State, C=CN" 2>/dev/null
fi
apksigner sign --ks "$KEYSTORE" --ks-pass pass:android --ks-key-alias debug \
    --key-pass pass:android --out "$OUTPUT_DIR/${APK_NAME}.apk" "$BUILD_DIR/unsigned.apk"

rm -rf "$BUILD_DIR"

APK_SIZE=$(ls -lh "$OUTPUT_DIR/${APK_NAME}.apk" | awk '{print $5}')
echo ""
echo "=== 构建完成 ==="
echo "APK: $OUTPUT_DIR/${APK_NAME}.apk ($APK_SIZE)"
apksigner verify --print-certs "$OUTPUT_DIR/${APK_NAME}.apk" 2>&1 | head -1

cp "$OUTPUT_DIR/${APK_NAME}.apk" "/storage/emulated/0/Download/${APK_NAME}.apk" 2>/dev/null && \
  echo "已复制到: /storage/emulated/0/Download/${APK_NAME}.apk"
