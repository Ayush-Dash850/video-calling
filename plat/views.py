from django.shortcuts import render, redirect
from django.http import JsonResponse
from agora_token_builder import RtcTokenBuilder
import random 
import time 
from .models import Room

# Create your views here.
def getToken(request):
    appId = 'aa594f47cfc84b1abf37055ffd3e1f29'
    appCertificate = 'cdc2a3a3011f40d6a9b3301be43f7edf'

    channelName = request.GET.get('channel')
    if not channelName:
        return JsonResponse({'error': 'Channel required'}, status=400)

    uid = random.randint(1, 230)

    expirationTimeInSeconds = 3600 * 24
    currentTimeStamp = int(time.time())
    privilegeExpiredTs = currentTimeStamp + expirationTimeInSeconds

    role = 1  # or RtcRole.PUBLISHER

    token = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        uid,
        role,
        privilegeExpiredTs
    )

    return JsonResponse({'token': token, 'uid': uid})

def lobby(request): 
    return render(request, 'lobby.html', {})

def rooms(request): 
    return render(request, 'rooms.html', {})

def create_breakouts(request):
    room = request.GET.get("room")

    rooms = []

    for i in range(1, 5):
        rooms.append(f"{room}_room{i}")

    return JsonResponse({
        "rooms": rooms
    })