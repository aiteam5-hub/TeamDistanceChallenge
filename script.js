// State variables
let rawTeams = [];
let rawActivities = [];
let currentTab = 'individuals';
let searchQuery = '';
let teamFilter = 'all';
let activityFilter = 'all';

// Normalizes name for matching
function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

// Helper to get initials from name
function getInitials(name) {
    if (!name) return '??';
    const clean = name.trim().replace(/[^\w\s]/g, '');
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Generate a deterministic pastel color for avatars based on athlete name
function getAvatarColor(name) {
    const colors = [
        '#f87171', '#fb923c', '#fbbf24', '#34d399', 
        '#22d3ee', '#60a5fa', '#818cf8', '#a78bfa', '#f472b6'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
}

// Returns dynamic greeting based on hour
function updateGreeting() {
    const hour = new Date().getHours();
    const label = document.getElementById('greeting-label');
    if (hour >= 5 && hour < 12) {
        label.innerHTML = 'GOOD MORNING ☀️';
    } else if (hour >= 12 && hour < 18) {
        label.innerHTML = 'GOOD AFTERNOON ☀️';
    } else {
        label.innerHTML = 'GOOD EVENING 🌙';
    }
}

// Fetch and parse both CSVs dynamically from the repo
async function loadData() {
    const listContainer = document.getElementById('leaderboard-list');
    try {
        const cacheBuster = `?t=${new Date().getTime()}`;
        const teamsRes = await fetch(`teams.csv${cacheBuster}`);
        const teamsText = await teamsRes.text();
        rawTeams = Papa.parse(teamsText, { header: true, skipEmptyLines: true }).data;

        const activitiesRes = await fetch(`strava_club_activities.csv${cacheBuster}`);
        const activitiesText = await activitiesRes.text();
        rawActivities = Papa.parse(activitiesText, { header: true, skipEmptyLines: true }).data;

        // Render UI
        updateGreeting();
        render();
    } catch (error) {
        console.error("Error loading data:", error);
        listContainer.innerHTML = `<div class="empty-state">Error loading data. Make sure CSV files exist.</div>`;
    }
}

// Main render function
function render() {
    const listContainer = document.getElementById('leaderboard-list');
    
    // 1. Create a map of Athlete -> Team using normalized names
    const athleteToTeam = {};
    rawTeams.forEach(row => {
        if(row['Athlete Name'] && row['Team Name']) {
            athleteToTeam[normalizeName(row['Athlete Name'])] = row['Team Name'].trim();
        }
    });

    // Helper to look up team by athlete name
    function getTeam(name) {
        if (!name) return 'No Team';
        return athleteToTeam[normalizeName(name)] || 'No Team';
    }

    // 2. Aggregate individual distances on the fly to support dynamic filters
    const individualTotals = {};
    const normalizedNamesWithActivities = new Set();
    rawActivities.forEach(act => {
        const name = act['Athlete Name'];
        const distance = parseFloat(act['Distance (Miles)']) || 0;
        const type = act['Type']; // 'Run' or 'Walk'

        if (name) {
            // Apply activity type filter
            if (activityFilter !== 'all' && type !== activityFilter) {
                return;
            }
            individualTotals[name] = (individualTotals[name] || 0) + distance;
            normalizedNamesWithActivities.add(normalizeName(name));
        }
    });

    // Make sure all athletes in teams.csv are included even with 0 miles (if no filter applied)
    if (activityFilter === 'all') {
        rawTeams.forEach(row => {
            const name = row['Athlete Name'];
            if (name) {
                const norm = normalizeName(name);
                if (!normalizedNamesWithActivities.has(norm)) {
                    individualTotals[name] = 0.0;
                    normalizedNamesWithActivities.add(norm);
                }
            }
        });
    }

    // 3. Convert individuals to list and filter/sort
    let individuals = Object.keys(individualTotals).map(name => ({
        name: name,
        team: getTeam(name),
        distance: individualTotals[name]
    }));

    // Filter individuals by search query and team filter
    individuals = individuals.filter(athlete => {
        const matchesSearch = athlete.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTeam = (teamFilter === 'all' || athlete.team === teamFilter);
        return matchesSearch && matchesTeam;
    });

    // Sort individuals descending
    individuals.sort((a, b) => b.distance - a.distance);

    // 4. Aggregate team distances based on the filtered individuals
    const teamTotals = {};
    // Seed all known teams with 0
    rawTeams.forEach(row => {
        if (row['Team Name']) {
            teamTotals[row['Team Name'].trim()] = 0;
        }
    });
    teamTotals['No Team'] = 0;

    // Sum up based on individual totals
    Object.keys(individualTotals).forEach(name => {
        const team = getTeam(name);
        teamTotals[team] = (teamTotals[team] || 0) + individualTotals[name];
    });

    let teams = Object.keys(teamTotals).map(teamName => ({
        name: teamName,
        distance: teamTotals[teamName]
    }));

    // Filter teams by search query
    teams = teams.filter(team => {
        const matchesSearch = team.name.toLowerCase().includes(searchQuery.toLowerCase());
        // Skip "No Team" unless it has distance
        if (team.name === 'No Team' && team.distance === 0) return false;
        return matchesSearch;
    });

    // Sort teams descending
    teams.sort((a, b) => b.distance - a.distance);

    // 5. Update Header Metrics
    // Distance sum (always use overall total for type filter)
    const totalDistance = Object.values(individualTotals).reduce((a, b) => a + b, 0);
    document.getElementById('stat-distance').innerText = `${totalDistance.toFixed(2)} mi`;
    
    // Number of active athletes
    const activeAthletesCount = Object.keys(individualTotals).filter(n => individualTotals[n] > 0).length;
    document.getElementById('stat-athletes').innerText = activeAthletesCount;

    // Leader name
    let topLeader = '-';
    if (teams.length > 0) {
        // Top team leader (e.g. Group 3)
        const topTeam = teams.find(t => t.name !== 'No Team') || teams[0];
        topLeader = topTeam ? topTeam.name : '-';
    }
    document.getElementById('stat-leader').innerText = topLeader;

    // 6. Render List
    listContainer.innerHTML = '';
    const activeList = currentTab === 'individuals' ? individuals : teams;
    document.getElementById('record-count-badge').innerText = activeList.length;

    if (activeList.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">No matching items found.</div>`;
        return;
    }

    // Get max distance for progress segments calculation
    const maxDistance = activeList.length > 0 ? activeList[0].distance : 1;

    activeList.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';

        // Calculate progress segments (5 blocks)
        let activeSegments = 0;
        if (maxDistance > 0 && item.distance > 0) {
            activeSegments = Math.ceil((item.distance / maxDistance) * 5);
        }
        let segmentsHTML = '';
        for (let i = 0; i < 5; i++) {
            segmentsHTML += `<div class="segment ${i < activeSegments ? 'active' : ''}"></div>`;
        }

        if (currentTab === 'individuals') {
            // Render individual row
            const initials = getInitials(item.name);
            const avatarColor = getAvatarColor(item.name);
            const teamClass = item.team.toLowerCase().replace(/\s+/g, '');
            
            row.innerHTML = `
                <div class="row-rank">${index + 1}</div>
                <div class="row-icon-wrapper">
                    <div class="row-icon" style="background-color: ${avatarColor}">${initials}</div>
                </div>
                <div class="row-details">
                    <div class="row-title-row">
                        <span class="row-title">${item.name}</span>
                        <span class="row-subtitle-tag">Athlete</span>
                    </div>
                    <div class="row-progress-wrapper">
                        <div class="progress-segments">
                            ${segmentsHTML}
                        </div>
                    </div>
                </div>
                <div class="row-meta">
                    <span class="status-badge status-${teamClass}">
                        <span class="status-dot"></span>
                        ${item.team}
                    </span>
                </div>
                <div class="row-value-wrapper">
                    <span class="row-value">${item.distance.toFixed(2)} mi</span>
                    <span class="row-action-icon">🚀</span>
                </div>
            `;
        } else {
            // Render team row
            const initials = getInitials(item.name);
            const avatarColor = getAvatarColor(item.name);
            const teamClass = item.name.toLowerCase().replace(/\s+/g, '');
            
            row.innerHTML = `
                <div class="row-rank">${index + 1}</div>
                <div class="row-icon-wrapper">
                    <div class="row-icon" style="background-color: ${avatarColor}">${initials}</div>
                </div>
                <div class="row-details">
                    <div class="row-title-row">
                        <span class="row-title">${item.name}</span>
                        <span class="row-subtitle-tag">Team</span>
                    </div>
                    <div class="row-progress-wrapper">
                        <div class="progress-segments">
                            ${segmentsHTML}
                        </div>
                    </div>
                </div>
                <div class="row-meta">
                    <span class="status-badge status-${teamClass}">
                        <span class="status-dot"></span>
                        Active
                    </span>
                </div>
                <div class="row-value-wrapper">
                    <span class="row-value">${item.distance.toFixed(2)} mi</span>
                    <span class="row-action-icon">🚀</span>
                </div>
            `;
        }

        listContainer.appendChild(row);
    });
}

// Bind UI event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Load initial data
    loadData();

    // Tab switcher: Individuals
    const tabIndiv = document.getElementById('tab-individuals');
    const tabTeams = document.getElementById('tab-teams');
    const teamFilterSelect = document.getElementById('team-filter');

    tabIndiv.addEventListener('click', () => {
        currentTab = 'individuals';
        tabIndiv.classList.add('active');
        tabTeams.classList.remove('active');
        // Enable team filter on individuals tab
        teamFilterSelect.disabled = false;
        teamFilterSelect.style.opacity = '1';
        render();
    });

    // Tab switcher: Teams
    tabTeams.addEventListener('click', () => {
        currentTab = 'teams';
        tabTeams.classList.add('active');
        tabIndiv.classList.remove('active');
        // Disable team filter on teams tab (it's redundant)
        teamFilterSelect.disabled = true;
        teamFilterSelect.style.opacity = '0.5';
        render();
    });

    // Search input
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        render();
    });

    // Team Filter
    teamFilterSelect.addEventListener('change', (e) => {
        teamFilter = e.target.value;
        render();
    });

    // Activity Filter
    const activityFilterSelect = document.getElementById('activity-filter');
    activityFilterSelect.addEventListener('change', (e) => {
        activityFilter = e.target.value;
        render();
    });

    // Sync button (mock effect)
    const btnSync = document.getElementById('btn-sync');
    btnSync.addEventListener('click', () => {
        const btnText = btnSync.querySelector('span');
        const originalText = btnText.innerText;
        btnText.innerText = 'Syncing...';
        btnSync.style.opacity = '0.7';
        btnSync.disabled = true;
        
        setTimeout(() => {
            btnText.innerText = originalText;
            btnSync.style.opacity = '1';
            btnSync.disabled = false;
            loadData(); // reload
        }, 1000);
    });
});
