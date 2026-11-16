#/bin/sh

/bin/flash gen-pin
eval `flash get WLAN0_WSC_DISABLE`
if [ "$WLAN0_WSC_DISABLE" = 1 ];then
exit 0
fi


eval `flash get HW_WLAN0_WSC_PIN`
echo $HW_WLAN0_WSC_PIN > /var/wps_local_pin
echo 1 > /var/wps_start_pin
if [ ! $1 ] ; then
	echo "w" >/proc/gpio
fi
#/bin/init.sh gw bridge

#/bin/wscd -sig_start
