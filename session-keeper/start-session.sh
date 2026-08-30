#!/usr/bin/env bash
export DISPLAY=:99
export HOME=/home/ubuntu

pkill -f "Xvfb :99" 2>/dev/null || true
pkill x11vnc 2>/dev/null || true
pkill openbox 2>/dev/null || true
rm -f /tmp/.X99-lock
sleep 1

Xvfb :99 -screen 0 1512x950x24 -ac >/tmp/xvfb.log 2>&1 &
sleep 3
openbox >/tmp/openbox.log 2>&1 &
sleep 1
x11vnc -display :99 -rfbauth /home/ubuntu/.vnc/passwd -localhost -forever -shared -bg -o /tmp/x11vnc.log >/dev/null 2>&1
sleep 1

cd /home/ubuntu/li-session
exec /usr/bin/node daemon.mjs
