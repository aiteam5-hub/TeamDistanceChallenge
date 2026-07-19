async function loadData() {
    try {
        // Fetch and parse both CSVs dynamically from the repo
        const teamsRes = await fetch('teams.csv');
        const teamsText = await teamsRes.text();
        const teamsData = Papa.parse(teamsText, { header: true, skipEmptyLines: true }).data;

        const activitiesRes = await fetch('strava_club_activities.csv');
        const activitiesText = await activitiesRes.text();
        const activitiesData = Papa.parse(activitiesText, { header: true, skipEmptyLines: true }).data;

        processData(teamsData, activitiesData);
    } catch (error) {
        console.error("Error loading data:", error);
        document.getElementById('team-list').innerHTML = "<li>Error loading data. Make sure CSV files exist.</li>";
    }
}

function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function processData(teamsData, activitiesData) {
    // 1. Create a map of Athlete -> Team using normalized names
    const athleteToTeam = {};
    teamsData.forEach(row => {
        if(row['Athlete Name'] && row['Team Name']) {
            athleteToTeam[normalizeName(row['Athlete Name'])] = row['Team Name'].trim();
        }
    });

    // Helper to look up team by athlete name
    function getTeam(name) {
        if (!name) return 'No Team';
        return athleteToTeam[normalizeName(name)] || 'No Team';
    }

    // 2. Aggregate distances for individuals and teams
    const individualTotals = {};
    const teamTotals = {};

    activitiesData.forEach(act => {
        const name = act['Athlete Name'];
        const distance = parseFloat(act['Distance (Miles)']) || 0;

        if (name) {
            // Add to individual
            individualTotals[name] = (individualTotals[name] || 0) + distance;
            
            // Add to team
            const team = getTeam(name);
            teamTotals[team] = (teamTotals[team] || 0) + distance;
        }
    });

    // 3. Convert to arrays and sort by distance
    const individualArray = Object.keys(individualTotals).map(name => ({
        name: name,
        team: getTeam(name),
        distance: individualTotals[name]
    })).sort((a, b) => b.distance - a.distance);

    const teamArray = Object.keys(teamTotals).map(team => ({
        name: team,
        distance: teamTotals[team]
    })).sort((a, b) => b.distance - a.distance);

    // 4. Render UI
    renderIndividuals(individualArray);
    renderTeams(teamArray);
}

function renderIndividuals(data) {
    const list = document.getElementById('individual-list');
    list.innerHTML = '';
    
    data.forEach((athlete, index) => {
        const li = document.createElement('li');
        li.className = 'leaderboard-item';
        
        li.innerHTML = `
            <span class="rank-col">${index + 1}</span>
            <span class="name-col">${athlete.name}</span>
            <span class="team-col">${athlete.team}</span>
            <span class="dist-col">${athlete.distance.toFixed(2)} mi</span>
        `;
        list.appendChild(li);
    });
}

function renderTeams(data) {
    const list = document.getElementById('team-list');
    list.innerHTML = '';
    
    data.forEach((team, index) => {
        // Skip "No Team" unless you want to see people unassigned
        if (team.name === 'No Team' && team.distance === 0) return;
        
        const li = document.createElement('li');
        li.className = 'leaderboard-item';
        
        li.innerHTML = `
            <span class="rank-col">${index + 1}</span>
            <span class="name-col">${team.name}</span>
            <span class="dist-col">${team.distance.toFixed(2)} mi</span>
        `;
        list.appendChild(li);
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', loadData);
