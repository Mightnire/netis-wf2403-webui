#/bin/sh
eval `flash get WLAN0_WSC_DISABLE`
if [ "$WLAN0_WSC_DISABLE" = 1 ];then
exit 0
fi


/bin/wscd -sig_start

