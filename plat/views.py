from django.shortcuts import render, redirect
from django.http import JsonResponse
from agora_token_builder import RtcTokenBuilder
import random 
import time 
from .models import Room, RoomMember
from django.views.decorators.csrf import csrf_exempt
import json 

# Create your views here.
def getToken(request):
    appId = 'aa594f47cfc84b1abf37055ffd3e1f29'
    appCertificate = 'cdc2a3a3011f40d6a9b3301be43f7edf'

    channelName = request.GET.get('channel')
    uid = request.GET.get('uid')

    if not channelName:
        return JsonResponse({'error': 'Channel required'}, status=400)

    if uid is None:
        uid = random.randint(1, 230)
    else:
        uid = int(uid)

    expirationTimeInSeconds = 3600 * 24
    currentTimeStamp = int(time.time())
    privilegeExpiredTs = currentTimeStamp + expirationTimeInSeconds

    role = 1

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

@csrf_exempt
def createMember(request):
    data = json.loads(request.body)
    member, created = RoomMember.objects.get_or_create(
        name=data['name'],
        uid=data['UID'],
        room_name=data['room_name']
    )

    return JsonResponse({'name':data['name']}, safe=False)


def getMember(request):
    uid = request.GET.get('UID')
    room_name = request.GET.get('room_name')

    member = RoomMember.objects.filter(
        uid=uid,
        room_name=room_name,
    ).first()

    if not member:
        return JsonResponse({'name': 'Unknown'}, safe=False)

    return JsonResponse({'name': member.name}, safe=False)

@csrf_exempt
def deleteMember(request):
    data = json.loads(request.body)
    member = RoomMember.objects.get(
        name=data['name'],
        uid=data['UID'],
        room_name=data['room_name']
    )
    member.delete()
    return JsonResponse('Member deleted', safe=False)

def getRoomMembers(request):
    room_name = request.GET.get('room_name')

    members = RoomMember.objects.filter(room_name=room_name)

    data = [
        {
            "name": m.name,
            "uid": m.uid
        }
        for m in members
    ]

    return JsonResponse({'members': data})