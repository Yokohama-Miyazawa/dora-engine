#!/bin/sh
TMP="$4"
DICT_PATH="$1"
VOICE_PATH="$2"
echo "$3" | open_jtalk \
-m $VOICE_PATH \
-x $DICT_PATH \
-ow $TMP
