from flask import Flask, render_template, request, jsonify
import requests

app = Flask(__name__)

ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImNiMzgwMzQxZWJmNDQxZDNhMTIzNDdiNDBhYjA1Njk4IiwiaCI6Im11cm11cjY0In0="
WEATHER_API_KEY = "048c27bb1d7a338c4b03a84d9488c522"

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    data = request.json
    start = data['start']
    end = data['end']

    # Step 1: Geocode start and end into coordinates (lat, lon)
    geo_url = f"https://nominatim.openstreetmap.org/search"
    start_geo = requests.get(geo_url, params={'q': start, 'format': 'json'}).json()
    end_geo = requests.get(geo_url, params={'q': end, 'format': 'json'}).json()

    if not start_geo or not end_geo:
        return jsonify({"error": "Invalid locations entered."})

    start_coords = [float(start_geo[0]['lon']), float(start_geo[0]['lat'])]
    end_coords = [float(end_geo[0]['lon']), float(end_geo[0]['lat'])]

    # Step 2: Get ETA (in seconds) using OpenRouteService
    route_url = "https://api.openrouteservice.org/v2/directions/driving-car"
    headers = {"Authorization": ORS_API_KEY, "Content-Type": "application/json"}
    body = {"coordinates": [start_coords, end_coords]}

    route_data = requests.post(route_url, json=body, headers=headers).json()
    duration_sec = route_data['features'][0]['properties']['segments'][0]['duration']
    eta = int(duration_sec // 60)  # Convert to minutes

    # Step 3: Get weather (optional)
    weather_url = f"https://api.openweathermap.org/data/2.5/weather?q={start}&appid={WEATHER_API_KEY}"
    weather_data = requests.get(weather_url).json()
    condition = weather_data['weather'][0]['main']

    # Step 4: Adjust alarm if bad weather
    adjustment = 10 if condition.lower() in ["rain", "storm", "snow"] else 0

    return jsonify({
        "eta": eta,
        "adjustment": adjustment,
        "message": f"Will wake you up {adjustment} minutes early. ETA: {eta} mins. Weather: {condition}"
    })

if __name__ == "__main__":
    app.run(debug=True)
