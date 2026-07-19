import os
import requests
import pandas as pd
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

CLIENT_ID = os.getenv('STRAVA_CLIENT_ID')
CLIENT_SECRET = os.getenv('STRAVA_CLIENT_SECRET')
REFRESH_TOKEN = os.getenv('STRAVA_REFRESH_TOKEN')

CLUB_ID = '2250366'
EXCEL_FILENAME = 'strava_club_activities.xlsx'
CSV_FILENAME = 'strava_club_activities.csv'

def get_access_token():
    """Uses the refresh token to get a new access token."""
    print("Refreshing access token...")
    auth_url = "https://www.strava.com/api/v3/oauth/token"
    payload = {
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'refresh_token': REFRESH_TOKEN,
        'grant_type': 'refresh_token',
        'f': 'json'
    }
    
    response = requests.post(auth_url, data=payload)
    if response.status_code == 200:
        access_token = response.json().get('access_token')
        print("Access token retrieved successfully.")
        return access_token
    else:
        print(f"Error getting access token: {response.status_code}")
        print(response.json())
        return None

def get_club_activities(access_token):
    """Fetches recent activities for the club."""
    print(f"Fetching recent activities for club {CLUB_ID}...")
    activities_url = f"https://www.strava.com/api/v3/clubs/{CLUB_ID}/activities"
    headers = {'Authorization': f'Bearer {access_token}'}
    params = {'per_page': 200, 'page': 1} # Fetch up to 200 recent activities
    
    response = requests.get(activities_url, headers=headers, params=params)
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error fetching activities: {response.status_code}")
        print(response.json())
        return []

def format_time(seconds):
    """Converts seconds into HH:MM:SS format."""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{int(hours):02d}:{int(minutes):02d}:{int(secs):02d}"

def filter_and_format_activities(activities):
    """Filters for Run/Walk and formats the data for CSV."""
    filtered_data = []
    
    for activity in activities:
        athlete = activity.get('athlete', {})
        first_name = athlete.get('firstname', 'Unknown')
        last_name = athlete.get('lastname', 'Unknown')
        athlete_full = f"{first_name} {last_name}".strip()
        
        activity_name = activity.get('name', '')
        distance_meters = activity.get('distance', 0)
        distance_miles = distance_meters * 0.000621371
        
        # Hardcoded cutoff boundary (these activities and older are ignored)
        cutoffs = [
            ("Brent M.", "Afternoon", 1.82),
            ("Coffee Papi", "5 x 800", 2.51),
            ("Coffee Papi", "1 Mile", 1.00),
            ("Rachel T.", "Evening Wa", 0.98)
        ]
        
        is_cutoff = False
        for c_name, c_act, c_dist in cutoffs:
            if c_name in athlete_full and c_act in activity_name and abs(distance_miles - c_dist) < 0.1:
                is_cutoff = True
                break
                
        if is_cutoff:
            print(f"Hit cutoff boundary: {athlete_full} - {activity_name}. Stopping.")
            break

        # Check if type is Run or Walk
        activity_type = activity.get('type', '')
        if activity_type in ['Run', 'Walk']:
            # Format as a dictionary
            filtered_data.append({
                'Athlete Name': athlete_full,
                'Activity Name': activity_name,
                'Type': activity_type,
                'Distance (Miles)': round(distance_miles, 2),
                'Moving Time': format_time(activity.get('moving_time', 0)),
                'Elapsed Time': format_time(activity.get('elapsed_time', 0)),
                'Elevation Gain (m)': activity.get('total_elevation_gain', 0)
            })
            
    print(f"Filtered down to {len(filtered_data)} Run/Walk activities.")
    return filtered_data

def save_to_files(new_activities):
    """Appends new activities to the CSV and Excel files without duplicating."""
    new_df = pd.DataFrame(new_activities)
    
    if new_df.empty:
        print("No new running/walking activities to save.")
        return

    # To avoid duplicates without an ID, we create a composite key
    composite_cols = ['Athlete Name', 'Activity Name', 'Distance (Miles)', 'Moving Time']
    
    if os.path.exists(EXCEL_FILENAME):
        existing_df = pd.read_excel(EXCEL_FILENAME)
        
        # Combine existing and new, then drop duplicates based on the composite key
        combined_df = pd.concat([existing_df, new_df], ignore_index=True)
        final_df = combined_df.drop_duplicates(subset=composite_cols, keep='first')
        
        added_count = len(final_df) - len(existing_df)
        print(f"Added {added_count} new records.")
    else:
        final_df = new_df
        print(f"Created files with {len(final_df)} records.")
        
    final_df.to_excel(EXCEL_FILENAME, index=False)
    final_df.to_csv(CSV_FILENAME, index=False)
    print("Done.")

def main():
    if not all([CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN]):
        print("Error: Missing Strava API credentials in environment variables.")
        print("Please set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN.")
        return
        
    access_token = get_access_token()
    if not access_token:
        return
        
    activities = get_club_activities(access_token)
    if not activities:
        return
        
    filtered = filter_and_format_activities(activities)
    save_to_files(filtered)

if __name__ == "__main__":
    main()
