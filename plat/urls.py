from django.urls import path 
from . import views 

urlpatterns = [
    path('', views.lobby, name="home"), 
    path('rooms/', views.rooms, name="rooms"), 
    path('get_token/', views.getToken), 
]