# Validation report (v2)

Hard checks: 14131/14132 passed, 0 failures. Presence spot-check: 52 pass, 0 fail, 6 image-only. Near-duplicate name pairs flagged: 5.

The presence spot-check only confirms a name appears in its snapshot; completeness, slate exclusivity, duplicates, ids, types and pamphlet counts are separate checks below.

## Checks

| check | passed | total |
|---|---|---|
| endorser_id+name | 965 | 965 |
| type | 965 | 965 |
| formality | 965 | 965 |
| relationship | 965 | 965 |
| direction | 965 | 965 |
| target | 965 | 965 |
| race | 965 | 965 |
| source_url | 965 | 965 |
| date | 965 | 965 |
| provenance | 965 | 965 |
| type_title_consistency | 965 | 965 |
| edge_source_url | 1169 | 1169 |
| no_duplicate_edges | 965 | 965 |
| slate_xor_member | 609 | 609 |
| unique_endorser_ids | 676 | 676 |
| candidate_node_ids | 24 | 24 |
| no_membership_in_edges | 1 | 1 |
| slate_members_table | 1 | 1 |
| page_completeness_orgs | 16 | 16 |
| org_page_completeness | 10 | 10 |
| pamphlet_ref_counts | 23 | 23 |
| candidate_coverage | 22 | 23 |

## Hard failures

None

## Page completeness (org endorsers)

| page | expected | edges | result |
|---|---|---|---|
| https://aidanhill.vote/endorse | 3 | 3 | PASS |
| https://berkeleyrentboard.com/endorsements/ | 9 | 9 | PASS |
| https://electmarimendonca.com/endorsements/ | 0 | 0 | PASS |
| https://majdiforberkeley.com/endorsements/ | 4 | 4 | PASS |
| https://shanoski4berkeley.nationbuilder.com/endorsements | 0 | 0 | PASS |
| https://www.caroleforrentboard.com | 3 | 3 | PASS |
| https://www.dariaforberkeley.com/endorsements | 19 | 19 | PASS |
| https://www.humbertforcouncil.com/#Endorsements | 13 | 13 | PASS |
| https://www.igortregub.com/endorsements | 35 | 35 | PASS |
| https://www.jennyforauditor.com/endorsements | 0 | 0 | PASS |
| https://www.laura4d1.com/endorsements | 4 | 4 | PASS |
| https://www.moniforberkeley.com/endorsements | 7 | 7 | PASS |
| https://www.rossforberkeley.com/endorsements | 15 | 15 | PASS |
| https://www.sandyparkforberkeley.com/endorse | 2 | 2 | PASS |
| https://www.syrakforsouthside.com/endorsements | 31 | 31 | PASS |
| https://www.wallmandistrict8.com/endorse | 3 | 3 | PASS |
| https://www.wellstoneclub.org/endorsements.html | 9 | 9 | PASS |
| https://www.berkeleydemocraticclub.com/ | 9 | 9 | PASS |
| https://acdems.org/endorsements-3/ | 12 | 12 | PASS |
| https://www.berkeleytenants.org/endorsements | 5 | 5 | PASS |
| https://www.eastbaydsa.org/electoral/ | 2 | 2 | PASS |
| https://www.eastbaystonewalldemocrats.org/Endorsements | 9 | 9 | PASS |
| https://bnhca.org/endorsements.html | 5 | 5 | PASS |
| https://eastbayforeveryone.org/2026/09/21/eb4e-2026-general-election-endorsements/ | 4 | 4 | PASS |
| https://yimbyaction.org/endorsements/november-2026-california-general | 4 | 4 | PASS |
| https://teamstersjc7.org/uncategorized/alameda-county-general-2026 | 2 | 2 | PASS |

## Merge audit (canonical <= variants merged)

- Nikki Fortunato Bas <= Nikki Fortunato-Bas
- Alameda Labor Council, AFL-CIO <= ALAMEDA LABOR COUNCIL | Alameda County Labor Council | Alameda Labor Council
- Berkeley Fire Fighters Association (IAFF Local 1227) <= Berkeley Fire Fighters Association | Berkeley Fire Fighters Association, IAFF Local 1227 | Berkeley Fire Fighters Association, Local 1227 | Berkeley Firefighters Association | Berkeley Firefighters Association 1227 | Berkeley Firefighters Association Local 1227 | Berkeley Firefighters' Association
- Berkeley Neighbors for Housing and Climate Action <= Berkeley Neighbors for Housing & Climate Action
- Boona Cheema <= boona chema
- Buffy Wicks <= Asm. Buffy Wicks
- Flip the Berkeley City Council <= Flip BCC Coalition | Flip Berkeley City Council | Flip the BCC
- Jesse Arreguín <= Jesse Arreguin | Sen. Jesse Arreguín
- Ka'Dijah Brown <= Ka'Dijah A. Brown
- Leah Simon-Weisberg <= Leah Simon Weisberg | Leah Simon-Weisburg
- Sierra Club (Northern Alameda County) <= SIERRA CLUB | Sierra Club | Sierra Club Northern Alameda County | The Sierra Club
- Berkeley Council of Classified Employees (AFT Local 6192) <= BERKELEY COUNCIL OF CLASSIFIED EMPLOYEES | Berkeley Council of Classified Employees | Berkeley Council of Classified Employees, AFT Local 6192
- California Working Families Party <= Working Families Party
- Green Party of Alameda County <= ALAMEDA COUNTY GREEN PARTY | Green Party Alameda County | Green Party CA Alameda County
- Margot Smith <= Margot Smith Dr. PH (Doctor of Public health) | Margot Smith, Dr. PH
- Michael Chang <= Mike Chang
- Moni T. Law <= Moni Law | Moni T. Law, J.D.
- Cheryl Davila <= Cheryl Davilla
- Dyana Delfín Polk <= Dyana Delfin Polk | Dyana Delfin-Polk
- Igor A. Tregub <= Igor Tregub
- Kera Binns <= Kera Bartlett Binns
- Robin D. López <= Robin Lopez
- Vanessa Marrero <= Vanessa Danielle Marrero
- AFSCME Local 1 <= AFSCME LOCAL ONE
- Alameda County Building & Construction Trades Council <= BUILDING AND CONSTRUCTION TRADES COUNCIL
- Asian Pacific American Democratic Caucus of Alameda County <= Asian Pacific American Democratic Caucus of Alameda Co.
- Debra R. Sanderson <= Debbie Sanderson
- East Bay Democratic Socialists of America <= EAST BAY DEMOCRATIC SOCIALISTS
- Fred M. Feller <= Fred Feller
- Gabriel Quinto <= Gabe Quinto
- Henry Levy <= Hank Levy
- Jeffrey Lee <= Jeffrey Bembry Lee Jr
- Libby Lee-Egan <= Libby Lee Egan
- Nicky González Yuen <= Nicky Gonzalez Yuen | Nicky González Yuen, Ph.D., J.D.
- Paul Kealoha Blake <= Paul-Kealoha Blake
- Plumbers & Steamfitters Local 342 <= Plumbers & Steamfitters Local Union 342 | Plumbers and Sprinkler Fitters Local 342
- Ren Zaro Fitzgerald <= Ren Fitzgerald
- Teamsters Joint Council 7 <= International Brotherhood of Teamsters, Joint Council 7
- Alisa Castleton Nowik <= Dr. Alisa Castleton Nowik
- Beth Waitkus <= Beth Waitkus, MSOD
- Bill Turner <= Micki & Bill Turner
- Black Women Organized for Political Action (Oakland/Berkeley PAC) <= Black Women Organized for Political Action Oakland/Berkeley PAC
- Dan Knapp <= Dan Knapp and Mary Lou Van Deventer
- David A. Blake <= Dave Blake
- David J. Cooper <= Rabbi David Cooper
- Hatem Bazian <= Dr. Hatem Bazian
- Jerry McNerney <= Jerry McNearmey
- John Selawsky <= John T Selawsky
- Judith C. Brown <= Professor Judith C. Brown
- Linda Schacht Gage <= Linda Schacht
- Madison Chesebro <= Maddie Chesebro
- Majdi "Gaith" Abuhamdieh <= Majdi Gaith
- Mary Lou Van Deventer <= Dan Knapp and Mary Lou Van Deventer
- Micki Turner <= Micki & Bill Turner
- Phillip Bokovoy <= Phil Bokovoy
- Rena Fischer <= Rena R. Fischer
- Sharon B. Drager <= Sharon B Drager MD
- Tatiana Guerreiro Ramos <= Tatiana Guerreiro-Ramos
- Vincent Casalaina <= Vince Casalaina

## Near-duplicate names (not merged)

- Anna De Leon / Aya De Leon
- David Levine / Deborah (Dobbie) Levine
- Jenifer Brown / Judith C. Brown
- Micki Turner / Molly Turner
- Ralda Lee / Reichi Lee

## Soft issues

- Mike McGuire -> Igor A. Tregub: Typed Current elected official (sitting State Senator) though title reads "Former CA Senate President Pro Tem"; confirm
-  -> Fred M. Feller: [candidate_coverage] no endorsement sources
- Anna De Leon -> Aya De Leon: Near-duplicate names (same surname+initial or ratio>0.9) - not merged; review
- David Levine -> Deborah (Dobbie) Levine: Near-duplicate names (same surname+initial or ratio>0.9) - not merged; review
- Jenifer Brown -> Judith C. Brown: Near-duplicate names (same surname+initial or ratio>0.9) - not merged; review
- Micki Turner -> Molly Turner: Near-duplicate names (same surname+initial or ratio>0.9) - not merged; review
- Ralda Lee -> Reichi Lee: Near-duplicate names (same surname+initial or ratio>0.9) - not merged; review

## Presence spot-check (seed 20261021)

| target | endorser | source | result |
|---|---|---|---|
| Aidan Hill | Auntie Frances Moore | https://aidanhill.vote/endorse | PASS |
| Aidan Hill | Steve Martinot | https://aidanhill.vote/endorse | PASS |
| Aidan Hill | Sam Gomez | https://aidanhill.vote/endorse | PASS |
| Avery Arbaugh | Alameda County Democratic Party | https://acdems.org/endorsements-3/ | MANUAL (image source) |
| Avery Arbaugh | East Bay Stonewall Democratic Club | https://www.eastbaystonewalldemocrats.org/Endorsements | PASS |
| Berkeley Right to Housing slate | Mia Bonta | https://berkeleyrentboard.com/endorsements/ | PASS |
| Berkeley Right to Housing slate | Dominique Walker | https://berkeleyrentboard.com/endorsements/ | PASS |
| Berkeley Right to Housing slate | Our Revolution East Bay | https://berkeleyrentboard.com/endorsements/ | PASS |
| Carole Marasovic | Alan Levy | https://www.caroleforrentboard.com | PASS |
| Carole Marasovic | David A. Blake | https://www.caroleforrentboard.com | PASS |
| Carole Marasovic | Jesse Arreguín | https://www.caroleforrentboard.com | PASS |
| Daria Wrubel | Ida Martinac | https://www.dariaforberkeley.com/endorsements | PASS |
| Daria Wrubel | Mia Bonta | https://www.dariaforberkeley.com/endorsements | PASS |
| Daria Wrubel | Barnali Ghosh | https://www.dariaforberkeley.com/endorsements | PASS |
| Ida Martinac | Alameda County Democratic Party | https://acdems.org/endorsements-3/ | MANUAL (image source) |
| Ida Martinac | East Bay Stonewall Democratic Club | https://www.eastbaystonewalldemocrats.org/Endorsements | PASS |
| Igor A. Tregub | Robert Rayburn | https://www.igortregub.com/endorsements | PASS |
| Igor A. Tregub | Michael Chang | https://www.igortregub.com/endorsements | PASS |
| Igor A. Tregub | Alameda County Building & Construction Trades Council | https://www.igortregub.com/endorsements | PASS |
| Jennifer Shanoski | Julie Sinai | https://shanoski4berkeley.nationbuilder.com/endorsements | PASS |
| Jennifer Shanoski | Mildred Scherr | https://shanoski4berkeley.nationbuilder.com/endorsements | PASS |
| Jennifer Shanoski | Joemy Ito-Gates | https://shanoski4berkeley.nationbuilder.com/endorsements | PASS |
| Jenny Wong | Alameda County Democratic Party | https://acdems.org/endorsements-3/ | MANUAL (image source) |
| Jenny Wong | Gordon Wozniak | https://www.jennyforauditor.com/endorsements | PASS |
| Jenny Wong | Jen Corn | https://www.jennyforauditor.com/endorsements | PASS |
| Ka'Dijah Brown | Wellstone Democratic Renewal Club | https://www.wellstoneclub.org/endorsements.html | PASS |
| Ka'Dijah Brown | Alameda County Democratic Party | https://acdems.org/endorsements-3/ | MANUAL (image source) |
| Ka'Dijah Brown | Berkeley Democratic Club | https://www.berkeleydemocraticclub.com/ | PASS |
| Laura Babitt | Jesse Arreguín | https://acvote.alamedacountyca.gov/acvote-assets/02_election_information/PDFs/20261103/Voter%20Information%20Guide/vig_nov2026_eng.pdf#page=728 | PASS |
| Laura Babitt | Shirley Issel | https://www.laura4d1.com/endorsements | PASS |
| Laura Babitt | Berkeley Fire Fighters Association (IAFF Local 1227) | https://www.laura4d1.com/endorsements | PASS |
| Majdi "Gaith" Abuhamdieh | Hatem Bazian | https://majdiforberkeley.com/endorsements/ | PASS |
| Majdi "Gaith" Abuhamdieh | Flip the Berkeley City Council | https://majdiforberkeley.com/endorsements/ | PASS |
| Majdi "Gaith" Abuhamdieh | Cheryl Davila | https://majdiforberkeley.com/endorsements/ | PASS |
| Mari Mendonca | Xavier Johnson | https://electmarimendonca.com/endorsements/ | PASS |
| Mari Mendonca | Moni T. Law | https://electmarimendonca.com/endorsements/ | PASS |
| Mari Mendonca | Catherine Lazio | https://electmarimendonca.com/endorsements/ | PASS |
| Mark Humbert | Rashi Kesarwani | https://www.humbertforcouncil.com/#Endorsements | PASS |
| Mark Humbert | Guy Micco | https://www.humbertforcouncil.com/#Endorsements | PASS |
| Mark Humbert | Jean Walsh | https://acvote.alamedacountyca.gov/acvote-assets/02_election_information/PDFs/20261103/Voter%20Information%20Guide/vig_nov2026_eng.pdf#page=735 | PASS |
| Michael Wallman | Lorna Lee Byrne | https://www.wallmandistrict8.com/endorse | PASS |
| Michael Wallman | Dorothea Bowman-Schmidt | https://www.wallmandistrict8.com/endorse | PASS |
| Michael Wallman | Brooke Frederick | https://www.wallmandistrict8.com/endorse | PASS |
| Moni Gangopadhyay | Paola Laverde | https://www.moniforberkeley.com/endorsements | PASS |
| Moni Gangopadhyay | Soli Alpert | https://www.moniforberkeley.com/endorsements | PASS |
| Moni Gangopadhyay | Leah Simon-Weisberg | https://www.moniforberkeley.com/endorsements | PASS |
| Nathan Mizell | Alameda County Democratic Party | https://acdems.org/endorsements-3/ | MANUAL (image source) |
| Nathan Mizell | East Bay Stonewall Democratic Club | https://www.eastbaystonewalldemocrats.org/Endorsements | PASS |
| Ross Bernet | Operating Engineers Local 3 | https://www.rossforberkeley.com/endorsements | PASS |
| Ross Bernet | Marc Hedlund | https://www.rossforberkeley.com/endorsements | PASS |
| Ross Bernet | Karen Parolek | https://www.rossforberkeley.com/endorsements | PASS |
| Sandy Park | Molly Nicol | https://www.sandyparkforberkeley.com/endorse | PASS |
| Sandy Park | Berkeley Federation of Teachers | https://acvote.alamedacountyca.gov/acvote-assets/02_election_information/PDFs/20261103/Voter%20Information%20Guide/vig_nov2026_eng.pdf#page=673 | PASS |
| Sandy Park | Bess Hepner | https://www.sandyparkforberkeley.com/endorse | PASS |
| Syrak Micael | Housing Action Coalition | https://www.syrakforsouthside.com/endorsements | PASS |
| Syrak Micael | Abigail Verino | https://www.syrakforsouthside.com/endorsements | PASS |
| Syrak Micael | Berkeley Democratic Club | https://www.berkeleydemocraticclub.com/ | PASS |
| Vylma Ortiz | Alameda County Democratic Party | https://acdems.org/endorsements-3/ | MANUAL (image source) |
