#!/bin/sh
if [ $1 = "wps" ] ;then
	eval `flash get  WSC_DISABLE`
	eval `flash get  WLAN0_ENCRYPT`
	if [ $WSC_DISABLE = 1 ];then
		sleep 1
		if [ $WLAN0_ENCRYPT = 2 -o $WLAN0_ENCRYPT = 4 -o $WLAN0_ENCRYPT = 6 ]; then
			flash set WSC_CONFIGURED 1
		else
			flash set WSC_CONFIGURED 0
		fi
		flash set WSC_DISABLE 0
		flash set WSC_AUTH 1
		flash set WSC_ENC 1
		ifconfig wlan0-vxd down
		sh /bin/wpspin.sh			
		/bin/init.sh gw all
		sh /bin/wpsstart.sh
		echo "w" > /proc/gpio
	fi
fi
