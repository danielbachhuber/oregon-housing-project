// Charts for Career Mastermind presentation
// Data sources:
//   - Up for Growth, "Housing Underproduction in the U.S." 2024 dataset (XLSX), States sheet
//   - Oregon Housing Needs Analysis 2026 Production Targets and Adopted Methodology (Dec 2025)

(function() {
  // Line chart: units needed vs units built with shaded gap
  var ctx = document.getElementById('underproduction-chart');
  if (ctx) {
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2021', '2022'],
        datasets: [
          {
            label: 'Units needed',
            data: [1716954, 1727819, 1741956, 1780118, 1794285, 1836224, 1877237, 1894464, 1924274, 1937817],
            borderColor: '#c0392b',
            backgroundColor: 'rgba(192, 57, 43, 0.15)',
            borderWidth: 3,
            pointRadius: 4,
            fill: '+1'
          },
          {
            label: 'Units built',
            data: [1682531, 1684107, 1700611, 1718509, 1732887, 1768582, 1788743, 1808482, 1837009, 1859349],
            borderColor: '#2c3e50',
            borderWidth: 3,
            pointRadius: 4,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { size: 14 }, usePointStyle: true }
          },
          annotation: {
            annotations: {
              gapLabel: {
                type: 'label',
                xValue: '2019',
                yValue: 1851000,
                content: ['78K unit', 'deficit'],
                color: '#c0392b',
                font: { size: 13, weight: 'bold' }
              }
            }
          }
        },
        scales: {
          y: {
            ticks: {
              callback: function(value) {
                return (value / 1000000).toFixed(1) + 'M';
              }
            }
          }
        }
      }
    });
  }

  // Stacked bar: 20-year need breakdown by driver
  var barCtx = document.getElementById('drivers-chart');
  if (barCtx) {
    new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: [''],
        datasets: [
          { label: 'Population growth (243K)', data: [242675], backgroundColor: '#c0392b' },
          { label: 'Demographic change (136K)', data: [135718], backgroundColor: '#e74c3c' },
          { label: 'Underproduction (50K)', data: [50191], backgroundColor: '#f39c12' },
          { label: 'Homelessness (46K)', data: [45637], backgroundColor: '#e67e22' },
          { label: 'Second homes (17K)', data: [17126], backgroundColor: '#d35400' }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 }, boxWidth: 12, padding: 8 }
          },
          title: {
            display: true,
            text: 'What\u2019s driving the need: 491K units needed (2026\u20132046)',
            font: { size: 14 },
            padding: { bottom: 4 }
          }
        },
        scales: {
          x: { stacked: true, display: false },
          y: { stacked: true, display: false }
        }
      }
    });
  }
})();
