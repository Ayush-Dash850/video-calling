from django.urls import path 
from . import views 

urlpatterns = [
    path('', views.lobby, name="home"), 
    path('rooms/', views.rooms, name="rooms"), 
    path('get_token/', views.getToken), 
    path("create-breakouts/", views.create_breakouts, name="create_breakouts"), 
    path('create_member/', views.createMember),
    path('get_member/', views.getMember),
    path('delete_member/', views.deleteMember),
    path('get_room_members/', views.getRoomMembers),
]