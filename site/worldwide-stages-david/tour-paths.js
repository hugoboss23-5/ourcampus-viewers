/** 2026-10-03. Guided paths for the CURRENT saved new campus models only.
 * Three.js coordinates: [Blender X, Blender Z, -Blender Y].
 * Every exterior low-camera shaft/drift is conservatively clear of actual GLB
 * primitive bounds expanded 0.35 m. Closed entrances require an indoor dissolve.
 * Animate each flight segment separately with bounded easing; do not spline
 * across waypoints or let interpolation descend below the 80 m lateral leg.
 */
export const campusTours = {
  "option-02": {
    "optionId": "option-02",
    "modelSha256": "bc9f1b9fc041201edfac9cf272a7b7745917bdbfa5123e415b8ceeb9b7141ab9",
    "planSha256": "977bafb0ab9fc88711c5994f3e9772c3189b70bcabd7c96c5df79446bc0441d7",
    "transitAltitude": 80,
    "chapters": [
      {
        "id": "campus",
        "title": "Worldwide Stages",
        "caption": "Two 100,000 sq ft halls share a campus with sports, events, 1,500 parking spaces and a 30-acre outdoor planning area. This is a schematic design.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              660.0,
              390,
              292.5
            ],
            "t": [
              180.0,
              0,
              -247.5
            ],
            "seconds": 5
          }
        ]
      },
      {
        "id": "arrival",
        "title": "Arriving at the sports hall",
        "caption": "A framed entrance and sheltered forecourt introduce the sports hall. Timber, limestone and bronze bring detail and warmth to the arrival.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              67.58,
              1.7,
              6.34
            ],
            "t": [
              80.58,
              5.6,
              -20.66
            ],
            "seconds": 5
          },
          {
            "p": [
              68.08,
              1.7,
              6.04
            ],
            "t": [
              80.58,
              5.6,
              -20.66
            ],
            "seconds": 3
          }
        ]
      },
      {
        "id": "sports-inside",
        "title": "Inside the sports hall",
        "caption": "Sixteen indoor pickleball courts join basketball, indoor soccer, batting, gym and physio areas. The sports brief calls for 37 ft of clear height.",
        "entry": "dissolve",
        "exit": "dissolve",
        "poses": [
          {
            "p": [
              55.0,
              1.7,
              -49.66
            ],
            "t": [
              32.0,
              8.5,
              -97.66
            ],
            "seconds": 5
          },
          {
            "p": [
              55.6,
              1.7,
              -50.16
            ],
            "t": [
              32.0,
              8.5,
              -97.66
            ],
            "seconds": 4
          }
        ]
      },
      {
        "id": "outdoor-pickleball",
        "title": "Eight more courts outdoors",
        "caption": "Eight outdoor pickleball courts complete the 24-court program. Walking routes separate the court pads from the adjoining soccer run-off.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              14.636799999999994,
              26,
              -154.7619648
            ],
            "t": [
              34.636799999999994,
              0.5,
              -213.77636479999998
            ],
            "seconds": 5
          },
          {
            "p": [
              22.636799999999994,
              26,
              -154.7619648
            ],
            "t": [
              34.636799999999994,
              0.5,
              -213.77636479999998
            ],
            "seconds": 4
          }
        ]
      },
      {
        "id": "soccer",
        "title": "Two soccer pitches and sideline seating",
        "caption": "Two synthetic-turf soccer pitches have spectator bleachers beside the touchlines, outside their run-off. Seating stays away from the goal ends.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              126.58,
              1.72,
              -178.7619648
            ],
            "t": [
              87.0,
              1,
              -221.2619648
            ],
            "seconds": 5
          },
          {
            "p": [
              126.58,
              1.72,
              -178.7619648
            ],
            "t": [
              165.0,
              1,
              -221.2619648
            ],
            "seconds": 5
          }
        ]
      },
      {
        "id": "events",
        "title": "The events hall",
        "caption": "The second 100,000 sq ft hall combines flexible exhibition areas with dining for 250, a kitchen, offices and a separate security area.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              228,
              1.7,
              -69.86
            ],
            "t": [
              217.04,
              5.6,
              -69.86
            ],
            "seconds": 5
          },
          {
            "p": [
              228.4,
              1.7,
              -70.06
            ],
            "t": [
              217.04,
              5.6,
              -69.86
            ],
            "seconds": 3
          }
        ]
      },
      {
        "id": "parking",
        "title": "Garage parking",
        "caption": "All 1,500 spaces are in one five-level garage. Reserved accessible spaces, ramps, protected walks and screened facades are shown for planning.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              405,
              35,
              -40
            ],
            "t": [
              296,
              7,
              -89
            ],
            "seconds": 5
          },
          {
            "p": [
              410,
              35,
              -48
            ],
            "t": [
              296,
              7,
              -89
            ],
            "seconds": 4
          }
        ]
      },
      {
        "id": "stage",
        "title": "Permanent stage and amphitheater",
        "caption": "A permanent covered stage faces tiered outdoor seating. The 8,000-guest event target still requires occupancy, egress and accessibility approval.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              313.0,
              19,
              -245.7619648
            ],
            "t": [
              270.0,
              4,
              -183.7619648
            ],
            "seconds": 5
          },
          {
            "p": [
              315.0,
              19,
              -247.7619648
            ],
            "t": [
              270.0,
              4,
              -183.7619648
            ],
            "seconds": 4
          }
        ]
      },
      {
        "id": "activity-park",
        "title": "A landscape with purpose",
        "caption": "The outdoor planning area combines sports, garden paths, native planting and places to exercise or gather. Survey, grading and drainage remain unresolved.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              298.8,
              36,
              -455
            ],
            "t": [
              234.0,
              1,
              -326.3809824
            ],
            "seconds": 5
          },
          {
            "p": [
              288.8,
              36,
              -449
            ],
            "t": [
              234.0,
              1,
              -326.3809824
            ],
            "seconds": 4
          }
        ]
      },
      {
        "id": "systems",
        "title": "Planning the building services",
        "caption": "Plant rooms and service routes are a coordination concept. The requested 20 MW allowance remains a target, subject to utility and engineering approval.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              92.72,
              80,
              -36.459999999999994
            ],
            "t": [
              57.72,
              7,
              -71.46
            ],
            "seconds": 6
          }
        ],
        "presentation": {
          "systems": true,
          "roofs": false
        }
      },
      {
        "id": "campus-finish",
        "title": "The campus together",
        "caption": "This option brings halls, parking, sport and planted outdoor spaces together. Parcel, engineering, occupancy and utility capacity remain to be confirmed.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              660.0,
              390,
              292.5
            ],
            "t": [
              180.0,
              0,
              -247.5
            ],
            "seconds": 5
          }
        ],
        "presentation": {
          "systems": false,
          "roofs": true
        }
      }
    ]
  },
  "option-05": {
    "optionId": "option-05",
    "modelSha256": "eb8d179eed0591119cc0b364218ff69b2ab127750c34863b85e143f632ea8a85",
    "planSha256": "910ef70bf621547b2ba86eaeaf015bb1f89b12e81cb8e777d5ccdf3d45c8c03b",
    "transitAltitude": 80,
    "chapters": [
      {
        "id": "campus",
        "title": "Worldwide Stages",
        "caption": "Two 100,000 sq ft halls share a campus with sports, events, 1,500 parking spaces and a 30-acre outdoor planning area. This is a schematic design.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              700.0,
              390,
              312.5
            ],
            "t": [
              220.0,
              0,
              -227.5
            ],
            "seconds": 5
          }
        ]
      },
      {
        "id": "arrival",
        "title": "Arriving at the sports hall",
        "caption": "A framed entrance and sheltered forecourt introduce the sports hall. Timber, limestone and bronze bring detail and warmth to the arrival.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              105.0,
              1.7,
              -65.0
            ],
            "t": [
              78.58,
              5.6,
              -70.0
            ],
            "seconds": 5
          },
          {
            "p": [
              105.5,
              1.7,
              -65.3
            ],
            "t": [
              78.58,
              5.6,
              -70.0
            ],
            "seconds": 3
          }
        ]
      },
      {
        "id": "sports-inside",
        "title": "Inside the sports hall",
        "caption": "Sixteen indoor pickleball courts join basketball, indoor soccer, batting, gym and physio areas. The sports brief calls for 37 ft of clear height.",
        "entry": "dissolve",
        "exit": "dissolve",
        "poses": [
          {
            "p": [
              53.0,
              1.7,
              -99.0
            ],
            "t": [
              30.0,
              8.5,
              -147.0
            ],
            "seconds": 5
          },
          {
            "p": [
              53.6,
              1.7,
              -99.5
            ],
            "t": [
              30.0,
              8.5,
              -147.0
            ],
            "seconds": 4
          }
        ]
      },
      {
        "id": "outdoor-pickleball",
        "title": "Eight more courts outdoors",
        "caption": "Eight outdoor pickleball courts complete the 24-court program. Walking routes separate the court pads from the adjoining soccer run-off.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              130.6368,
              26,
              -176.07797119999998
            ],
            "t": [
              150.6368,
              0.5,
              -235.09237119999997
            ],
            "seconds": 5
          },
          {
            "p": [
              138.6368,
              26,
              -176.07797119999998
            ],
            "t": [
              150.6368,
              0.5,
              -235.09237119999997
            ],
            "seconds": 4
          }
        ]
      },
      {
        "id": "soccer",
        "title": "Two soccer pitches and sideline seating",
        "caption": "Two synthetic-turf soccer pitches have spectator bleachers beside the touchlines, outside their run-off. Seating stays away from the goal ends.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              242.57999999999998,
              1.72,
              -200.07797119999998
            ],
            "t": [
              203.0,
              1,
              -242.57797119999998
            ],
            "seconds": 5
          },
          {
            "p": [
              242.57999999999998,
              1.72,
              -200.07797119999998
            ],
            "t": [
              281.0,
              1,
              -242.57797119999998
            ],
            "seconds": 5
          }
        ]
      },
      {
        "id": "events",
        "title": "The events hall",
        "caption": "The second 100,000 sq ft hall combines flexible exhibition areas with dining for 250, a kitchen, offices and a separate security area.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              121.86,
              1.7,
              -43.0
            ],
            "t": [
              134.86,
              5.6,
              -70.0
            ],
            "seconds": 5
          },
          {
            "p": [
              122.26,
              1.7,
              -43.2
            ],
            "t": [
              134.86,
              5.6,
              -70.0
            ],
            "seconds": 3
          }
        ]
      },
      {
        "id": "parking",
        "title": "Surface parking",
        "caption": "All 1,500 spaces are in two surface lots: 1,290 and 210. Accessible spaces, protected walks, tree islands and shade galleries organize the parking.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              350,
              45,
              -60
            ],
            "t": [
              330,
              1,
              -90
            ],
            "seconds": 5
          },
          {
            "p": [
              355,
              45,
              -68
            ],
            "t": [
              330,
              1,
              -90
            ],
            "seconds": 4
          }
        ]
      },
      {
        "id": "stage",
        "title": "Permanent stage and amphitheater",
        "caption": "A permanent covered stage faces tiered outdoor seating. The 8,000-guest event target still requires occupancy, egress and accessibility approval.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              109.0,
              19,
              -267.0779712
            ],
            "t": [
              66.0,
              4,
              -205.07797119999998
            ],
            "seconds": 5
          },
          {
            "p": [
              111.0,
              19,
              -269.0779712
            ],
            "t": [
              66.0,
              4,
              -205.07797119999998
            ],
            "seconds": 4
          }
        ]
      },
      {
        "id": "activity-park",
        "title": "A landscape with purpose",
        "caption": "The outdoor planning area combines sports, garden paths, native planting and places to exercise or gather. Survey, grading and drainage remain unresolved.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              365.2,
              36,
              -415
            ],
            "t": [
              286.0,
              1,
              -317.0389856
            ],
            "seconds": 5
          },
          {
            "p": [
              355.2,
              36,
              -409
            ],
            "t": [
              286.0,
              1,
              -317.0389856
            ],
            "seconds": 4
          }
        ]
      },
      {
        "id": "systems",
        "title": "Planning the building services",
        "caption": "Plant rooms and service routes are a coordination concept. The requested 20 MW allowance remains a target, subject to utility and engineering approval.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              90.72,
              80,
              -85.8
            ],
            "t": [
              55.72,
              7,
              -120.8
            ],
            "seconds": 6
          }
        ],
        "presentation": {
          "systems": true,
          "roofs": false
        }
      },
      {
        "id": "campus-finish",
        "title": "The campus together",
        "caption": "This option brings halls, parking, sport and planted outdoor spaces together. Parcel, engineering, occupancy and utility capacity remain to be confirmed.",
        "entry": "overflight",
        "exit": "overflight",
        "poses": [
          {
            "p": [
              700.0,
              390,
              312.5
            ],
            "t": [
              220.0,
              0,
              -227.5
            ],
            "seconds": 5
          }
        ],
        "presentation": {
          "systems": false,
          "roofs": true
        }
      }
    ]
  }
};
export function getCampusTour(optionId) {
  const tour=campusTours[typeof optionId==='string'?optionId:optionId?.id];
  return tour?JSON.parse(JSON.stringify(tour)):null;
}
/** Supply the actual previous camera pose and previous chapter exit mode.
 * 'dissolve' segments are opacity transitions/camera replacement, never a
 * visible flight through a closed roof/door. Reset to normal lighting/roof/
 * systems visibility after ending the tour in the owning viewer controller.
 */
export function makeTourTransit(fromPose,chapter,previousExit='overflight') {
  if(!chapter?.poses?.length)throw new Error('Tour chapter has no camera pose');
  const destination=chapter.poses[0];
  if(chapter.entry==='dissolve')return [{mode:'dissolve',p:[...destination.p],t:[...destination.t],seconds:1.2}];
  const altitude=Math.max(80,fromPose.p[1],destination.p[1]);
  const rise={p:[fromPose.p[0],altitude,fromPose.p[2]],t:[...fromPose.t]};
  const across={p:[destination.p[0],altitude,destination.p[2]],t:[...destination.t]};
  return [{mode:previousExit==='dissolve'?'dissolve':'flight',...rise,seconds:previousExit==='dissolve'?1.2:3},
          {mode:'flight',...across,seconds:5},
          {mode:'flight',p:[...destination.p],t:[...destination.t],seconds:3}];
}
