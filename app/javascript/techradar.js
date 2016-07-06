(function (exports) {
    "use strict";

    function TechRadar(radar) {
        this.radar = radar || {};
    }

    exports.TechRadar = TechRadar;

    TechRadar.prototype = {
        create: function () {

            /* these few configurations are the bare necessary stuff */
            var radius = this.radar.arcDistanceInPixel;
            var offset = radius * 0.25;
            var historyAnimation;

            // up from here we're just (re-)using the base-configs in order to derive others
            var width = (radius * _.size(this.radar.arcs)) * 2 + (offset * 2);
            var height = (radius * _.size(this.radar.arcs)) * 2 + (offset * 2);
            var center = {x: width / 2, y: height / 2};

            //noinspection HtmlUnknownTarget
            var linkTemplate = _.template("<a target='_blank' href='${url}'>${title}</a>");

            // true if any of the spots has more than 1 placements
            var historyEnabled = _.findIndex(this.radar.spots, function(sp) { return _.size(sp.placements) > 1; }) !== -1;

            var canvas = d3.select("#radar") //
                .append('svg')              // add a svg-container in order to draw some shapes
                .attr("width", (radius * _.size(this.radar.arcs)) * 2 + (offset * 2))
                .attr("height", (radius * _.size(this.radar.arcs)) * 2 + (offset * 2));

            var group = canvas.append("g").attr("transform", "translate(" + center.x + "," + center.y + ")");

            // draw lines in order to separate everything
            var max = (_.size(this.radar.arcs) * radius) + offset;
            drawline(canvas, {x: center.x, y: center.y}, {x: center.x, y: center.y - max});
            drawline(canvas, {x: center.x, y: center.y}, {x: center.x, y: center.y + max});
            drawline(canvas, {x: center.x, y: center.y}, {x: center.x - max, y: center.y});
            drawline(canvas, {x: center.x, y: center.y}, {x: center.x + max, y: center.y});

            drawArcLegend(canvas, this.radar.arcs.sort(sortByArcOrder));

            _.forEach(this.radar.quadrants, function (quadrant, quadrantIndex) {
                // Counting up already drawn items for cross-radar indexing
                var itemsDrawnCount = 0;

                // Create all arcs for this quadrant
                drawQuadrantLegend(group, quadrant, quadrantIndex, (this.radar.arcs.length - 1), radius);

                // write a head-line per quadrant
                createQuadrantHeadline(quadrant);

                _.forEach(this.radar.arcs, function (arc, arcIndex) {
                        drawQuadrantArc(group, radius, arcIndex, quadrantIndex, quadrant);

                        var items = findItemsOf(this.radar.spots, quadrant, arc);

                        var enterElement = canvas.selectAll('bogus')// join with sth. non-existent
                            .data(items)
                            .enter()
                            .append("g")
                            .attr("transform", function () {
                                return "translate(" + center.x + "," + center.y + ")";
                            });

                        // creates all spots for quadrant
                        createRadarSpots(enterElement, quadrant);

                        createArcHeadline(quadrant, arc);
                        createSpotLabelAndListElements(enterElement, quadrant, arc, itemsDrawnCount);

                    itemsDrawnCount += items.length;
                    }, this);




            }, this);

            renderHelp(canvas, this.radar);
            renderTooltip(canvas);

            function sortByArcOrder(a, b) {
                return a.order - b.order;
            }

            function findItemsOf(spots, quadrant, arc) {
                return _.filter(spots, function (spot) {
                    var spotAngle = currentPlacementOf(spot).coordinates.angle;

                    var quadrantMatch = quadrant.lowerAngle <= spotAngle && spotAngle < quadrant.upperAngle;
                    if(!quadrantMatch){
                        //short circuit if not in quadrant
                        return false;
                    }

                    var spotRadius = currentPlacementOf(spot).coordinates.radius;
                    var arcUpperRadius = arc.order * radius;
                    var arcLowerRadius = arcUpperRadius - radius + 1;
                    return arcLowerRadius <= spotRadius && spotRadius <= arcUpperRadius;
                });
            }

            //Renders element that is used as tooltip container
            function renderTooltip(tooltipCanvas) {
                var tooltipGroup = tooltipCanvas.append("g")
                    .attr("id", "spotTooltip")
                    .attr("transform", function () {
                        return "translate(" + center.x + "," + center.y + ")";
                    })
                    .style("visibility","hidden");

                tooltipGroup.append("rect")
                    .attr("rx", 5)
                    .attr("ry", 5)
                    .attr("height", 25)
                    .attr("stroke-width", 3)
                    //Following will be set when showing
                    .attr("width", 0)
                    .attr("x", 0)
                    .attr("y", 0);

                tooltipGroup.append("text")
                    .attr("class", "spotTooltip");
            }

            function renderHelp(helpCanvas, radar) {

                function toggleHelp() {
                    $('#help').modal({
                        opacity: 60, autoResize: true, overlayClose: true, overlayCss: {backgroundColor: "#fff"},
                        maxWidth: 780,
                        position: [100, 0],
                        onOpen: function (dialog) {
                            dialog.overlay.fadeIn();
                            dialog.data.fadeIn();
                            dialog.container.fadeIn();
                            document.getElementsByTagName('BODY')[0].classList = 'modal-open';
                        },
                        onClose: function(dialog) {
                            dialog.overlay.fadeOut();
                            dialog.data.fadeOut();
                            dialog.container.fadeOut(function() {
                                $.modal.close();
                            });
                            document.getElementsByTagName('BODY')[0].classList = '';
                        }
                    });
                }

                // render the help-text
                var helpDiv = d3.select('#help').append('div');
                helpDiv.append('h2').html(radar.title);
                helpDiv.append('div').html(radar.description);
                _.forEach(radar.arcs, function (arc) {
                    helpDiv.append('h3').html(arc.title);
                    helpDiv.append('div').html(arc.description);
                });

                helpCanvas.append('text')
                    .attr({'class': 'helpIcon', 'dx': 0, 'dy': '99%'})
                    .text('About TechRadar')
                    .style({'fill': '#009639', 'font-weight': 100, 'stroke': 'none'})
                    .on('click', function () {
                        toggleHelp();
                    });
            }

            function getPlacementDescription(spot, placement) {
                var placementDescription = placement.description;
                if (spot.url) {
                    placementDescription = placement.description
                        .replace(spot.title, linkTemplate({'url': spot.url, 'title': spot.title}));
                }
                return placementDescription;
            }

            function createRadarSpots(enterElement, quadrant) {

                var sortByRadius = function(a, b){
                    // From Adopt to Hold
                    return currentPlacementOf(a).coordinates.radius - currentPlacementOf(b).coordinates.radius;
                };

                enterElement.sort(sortByRadius).append("circle")
                    .attr("id", function (d) {
                        return asId(d.title);
                    })
                    .attr("cx", function (d) {
                        return polar_to_cartesian2(
                            currentPlacementOf(d).coordinates.radius,
                            currentPlacementOf(d).coordinates.angle).x;
                    })
                    .attr("cy", function (d) {
                        return polar_to_cartesian2(
                            currentPlacementOf(d).coordinates.radius,
                            currentPlacementOf(d).coordinates.angle).y;
                    })
                    .attr("r", 10)
                    .attr("class", function (d) {
                        return ((hasSpotMoved(d)) ? "spot hasMoved" : "spot");
                    })
                    .style("fill", quadrant.spotColor)
                    .on('mouseover', function (d) {
                        highlightSpot(d);
                    })
                    .on('mouseout', function (d) {
                        lowlightSpot(d);
                    })
                    .on('click', function (d) {
                        showDescriptionOf(d);
                    });
            }

            function asId(value) {
                return _.camelCase(value);
            }

            function createQuadrantHeadline(quadrant) {

                var quadrantId = asId(quadrant.title);
                var headline = d3.select("#items").append("p");

                headline.append("h3")
                    .text(quadrant.title)
                    .classed('headline quadrant', true)
                    .style("border-bottom-color", quadrant.spotColor)
                    .on('click', function () {
                        showQuadrantElements(quadrantId);
                    });

                headline.append("div")
                    .attr("id", quadrantId)
                    .classed('quadrantList', true);
            }

            function createArcHeadline(quadrant, arc) {
                var quadrantId = asId(quadrant.title);
                var arcId = asId(arc.title);

                var quadrantList = d3.select("div#"+quadrantId);

                quadrantList.append("h5")
                    .classed("headline arc", true)
                    .text(arc.title);

                quadrantList.append("ul")
                    .attr("id", quadrantId+"_"+arcId);
            }

            function createSpotLabelAndListElements(enterElement, quadrant, arc, itemsDrawnCount) {
                // write all label

                enterElement.append('text')
                    .text(function (d, i) {
                        createListElement((itemsDrawnCount+ i + 1), asId(quadrant.title)+"_"+asId(arc.title), d);
                        return (itemsDrawnCount+ i + 1);
                    })
                    .attr("class", "spotLabel") //
                    .attr("x", function (d, i) {
                        var xOffset = ((itemsDrawnCount+i < 9) ? 3 : 6);
                        return polar_to_cartesian2(
                                currentPlacementOf(d).coordinates.radius,
                                currentPlacementOf(d).coordinates.angle).x - xOffset;
                    }) //
                    .attr("y", function (d) {
                        var yOffset = 3;
                        return polar_to_cartesian2(
                                currentPlacementOf(d).coordinates.radius,
                                currentPlacementOf(d).coordinates.angle).y + yOffset;
                    }) //
                    .on('mouseover', function (d) {
                        highlightSpot(d);
                    }) //
                    .on('mouseout', function (d) {
                        lowlightSpot(d);
                    }) //
                    .on('click', function (d) {
                        showDescriptionOf(d);
                    });
            }

            function createListElement(count, listId, spot) {

                function isNewSpot(spot) {
                    return historyEnabled && _.size(spot.placements) <= 1;
                }

                function createListEntry() {

                    var li = d3.select("ul#" + listId)
                        .append("li")
                        .attr('class', 'itemText')
                        .attr("id", asId(spot.title));

                    var listElement = li.append("div")
                        .text(count + " " + spot.title)
                        .attr('class', 'label')
                        .on('mouseover', function () {
                            highlightSpot(spot);
                        })
                        .on('mouseout', function () {
                            lowlightSpot(spot);
                        })
                        .on('click', function () {
                            showDescriptionOf(spot);
                        });

                    if (isNewSpot(spot)) {
                        listElement.append('span')
                            .attr('class', 'badge_new')
                            .text('new');
                    }

                    return li;
                }

                function appendHistoryDivTo(historyDiv) {
                    // initially create a history-div-container for every spot
                    var historyBox = historyDiv.append('div')
                        .attr('class', 'history')
                        .attr('id', 'history' + spot.id);

                    // again print the name of the spot as history-headline
                    historyBox.append('h2')
                        .classed('headline', true)
                        .text(spot.title)
                        .on('click', function () {
                            window.open(spot.url, '_blank');

                            // leads to a chrome-crash !!
                            // var win = window.open(spot.url, '_blank');
                            // win.focus();
                        });

                    // the close-button in order to close the history-div
                    historyBox.append('div')
                        .attr('class', 'close')
                        .text('close')
                        .on('click', function () {
                            toggleHistoryOf(spot);
                        });

                    // for every placement create a dedicated container
                    _.forEach(orderedHistoryOfPlacementsFor(spot), function (placement) {
                        var since = new Date(placement.since);

                        historyBox.append('div')
                            .attr('class', 'date')
                            .text(since.toLocaleString('en-US', {year: 'numeric', month: 'long'}));
                        historyBox.append('div')
                            .attr('class', 'text')
                            .html(getPlacementDescription(spot, placement));
                    });

                    return historyBox;
                }

                function appendDescriptionDivTo(li) {
                    var descriptionBox = li.append('div')
                        .attr('class', 'description')
                        .style('display', 'none');

                    // var linkTemplate = _.template("<a target='_blank' href='${url}'>${title}</a>");
                    descriptionBox.append('div')
                        .html(getPlacementDescription(spot, currentPlacementOf(spot)));

                    return descriptionBox;
                }

                function appendLinkBarTo(descriptionBox) {
                    var linkbar = descriptionBox.append('div').attr('class', 'linkbar');

                    if (historyEnabled) {
                    linkbar.append('a')
                        .on('click', function () { toggleHistoryOf(spot); })
                        .attr('href', '#')
                        .text('History');
                    }

                    if (spot.url) {
                        linkbar.append('a')
                            .attr('class', 'destination')
                            .attr('target', '_blank')
                            .attr('href', spot.url)
                            .text('Homepage');
                    }

                    return linkbar;
                }

                var listElement = createListEntry();
                var descriptionDiv = appendDescriptionDivTo(listElement);
                appendHistoryDivTo(d3.select('#history'));
                appendLinkBarTo(descriptionDiv);
            }

            function showQuadrantElements(quadrantId){

                $("#items div:not(#"+quadrantId+").quadrantList").filter(function (index, element) {
                    var e = $(element);
                    if (e.css('display') !== 'none') {
                        e.slideUp(200, 'swing');
                    }
                });

                var containerToBeExpanded = $("#"+quadrantId);
                if (containerToBeExpanded.css('display') === 'none') {
                    containerToBeExpanded.slideDown(200, 'swing');
                } else {
                    containerToBeExpanded.slideUp(200, 'swing');
                }

            }

            function showDescriptionOf(spot) {
                if(jQuery.isFunction(window.ga)){
                    // Trigger Google Analytics event if GA is included in index.html
                    ga('send', {
                        hitType: 'event',
                        eventCategory: 'Radar',
                        eventAction: 'expand',
                        eventLabel: spot.title
                    });
                }

                $('.description').filter(function (index, element) {
                    var e = $(element);
                    if (e.css('display') !== 'none') {
                        e.slideUp(200, 'swing');
                    }
                });

                var itemIdToBeExpanded ='li#' + asId(spot.title);

                $("#items div.quadrantList").filter(function (index, element) {
                    var e = $(element);
                    //Close panel if it is opened and new item to be expanded is not inside it
                    if (e.css('display') !== 'none' && e.find(itemIdToBeExpanded).length === 0) {
                        e.slideUp(200, 'swing');
                    }
                });

                var toBeExpanded = $(itemIdToBeExpanded + ' .description');
                var containerToBeExpanded = toBeExpanded.closest('.quadrantList');

                if (containerToBeExpanded.css('display') === 'none') {
                    containerToBeExpanded.slideDown(200, 'swing');
                }

                if (toBeExpanded.css('display') === 'none') {
                    toBeExpanded.slideDown(200, 'swing');
                }
            }

            function toggleHistoryOf(spot) {

                $('.history').filter(function (i, element) {
                    var e = $(element);
                    if (e.css('display') !== 'none') {
                        e.slideUp(200, 'swing');
                    }
                });
                var history = $('#history' + spot.id);
                var openedNewOne = false;
                if (history.css('display') === 'none') {
                    history.slideDown(200, 'swing');
                    openedNewOne = true;
                }
                if (!openedNewOne) {
                    $('html,body').animate({scrollTop: $('#' + asId(spot.title)).offset().top - 100}, 'fast');
                } else {
                    $('html,body').animate({scrollTop: history.offset().top}, 'slow');
                }
            }

            function lowlightSpot(spot) {
                d3.selectAll("circle")
                    .attr({'fill-opacity': 1, 'stroke-opacity': 1});

                d3.select("circle#" + asId(spot.title)).transition() //
                    .ease('cubic-out').duration('200')
                    .attr("stroke-width", 1)
                    .attr("r", 10);

                //remove tooltip
                d3.select("#spotTooltip").style("visibility","hidden");

                d3.selectAll(".label").classed("highlight fade", false)
                    .style("background-color", "white");

                clearHistoricSpots();
            }

            function highlightSpot(spot) {
                var animationSpeed = '200';
                var spotExpandedSize = 18;

                // fade out all spots ...
                d3.selectAll("circle.spot")
                    .attr('fill-opacity', 0.4)
                    .attr("stroke-opacity", 0.4);

                var selectedSpot = d3.select("circle#" + asId(spot.title));
                // ... except for our selection-candidate
                selectedSpot.attr('fill-opacity', 1)
                    .attr("stroke-opacity", 1);

                // ... make our selection-candidate even bigger and animate that
                selectedSpot.transition().ease('cubic-out').duration(animationSpeed)
                    .attr("stroke-width", 3)
                    .attr("r", spotExpandedSize);


                var toolTipGroup = d3.select("#spotTooltip");

                var coordinatesOfSelectedSpot = currentPlacementOf(spot).coordinates;
                var selectedSpotCartesian2 = polar_to_cartesian2(coordinatesOfSelectedSpot.radius, coordinatesOfSelectedSpot.angle);

                var xOffset = (spotExpandedSize / 2) + 9;
                var yOffset = (spotExpandedSize / 2) + 9;

                var toolTipText = toolTipGroup.select("text")
                    .attr("x", selectedSpotCartesian2.x + xOffset)
                    .attr("y", selectedSpotCartesian2.y - yOffset)
                    .text(spot.title);

                toolTipGroup.select("rect")
                    .attr("width", toolTipText.node().getComputedTextLength() + 6)
                    .style("fill", selectedSpot.style("fill"))
                    .attr("x", selectedSpotCartesian2.x + xOffset - 3)
                    .attr("y", selectedSpotCartesian2.y - yOffset - 18);

                toolTipGroup.style("visibility", "visible");

                // ... fade out all list-entries
                d3.selectAll("#items .label").classed('fade', true);

                // except the corresponding list-entry (which should also be highlighted)
                d3.select("#items #" + asId(spot.title) + " .label")
                    .classed({'highlight': true, 'fade': false})
                    .style("background-color", selectedSpot.style("fill"));

                showHistoricSpots(spot);
            }

            function clearHistoricSpots() {
                // ... remove all spots and lines
                d3.selectAll(".historySpot").remove();
                d3.selectAll(".historyLine").remove();

                // ... and don't forget the animation-interval to clear
                clearInterval(historyAnimation);
            }

            function showHistoricSpots(spot) {
                var ordered = orderedHistoryOfPlacementsFor(spot);

                // determine placements that actually represent a movement big enough to be painted
                var placements = _.filter(ordered, function (placement) {
                    return distanceBetweenPlacements(currentPlacementOf(spot), placement) > 18;
                });

                // ... append those placements to the canvas but don't fill their color
                canvas.selectAll('bogus') // join with sth. non-existent
                    .data(placements).enter()
                    .append("g")
                    .attr("transform", function () {
                        return "translate(" + center.x + "," + center.y + ")";
                    })
                    .append("circle")
                    .attr("cx", function (p) {
                        return polar_to_cartesian2(radiusOf(p), angleOf(p)).x;
                    })
                    .attr("cy", function (p) {
                        return polar_to_cartesian2(radiusOf(p), angleOf(p)).y;
                    })
                    .attr("r", 10)
                    .attr('fill-opacity', 0)
                    .attr('stroke-opacity', 0)
                    .attr("class", "spot historySpot");

                // create array with the first/current spot and the history spots to draw the lines 
                var foo = [ordered[0]].concat(placements);

                // ... now peau a peau fill the spot-color to have a nice animation
                var i = 0;
                historyAnimation = setInterval(function () {
                    if ((i + 1) >= foo.length) {
                        clearInterval(historyAnimation);
                    }
                    else {
                        var from = polar_to_cartesian2(radiusOf(foo[i]), angleOf(foo[i]));
                        var to = polar_to_cartesian2(radiusOf(foo[i + 1]), angleOf(foo[i + 1]));
                        i++;

                        drawline(canvas,
                            {x: from.x + center.x, y: from.y + center.y},
                            {x: to.x + center.x, y: to.y + center.y},
                            "historyLine");

                        d3.select('.historySpot[fill-opacity="0"]')
                            .transition().ease('cubic-out').duration(500)
                            .attr('fill-opacity', 0.8);
                    }
                }, 750);
            }

            function drawQuadrantArc(group, radius, arcIndex, quadrantIndex, quadrant) {
                var background = quadrant.color || "none";
                var start = quadrant.lowerAngle * (Math.PI / 180);
                var end = quadrant.upperAngle * (Math.PI / 180);
                var inner = radius * arcIndex;
                var outer = radius * (arcIndex + 1);

                /*
                 * the start- and end-angles here are veeery confusing - also that the painting will be done 
                 * clock-wise - so we have to transpile the radians using the following formula:
                 * - radian + (Math.PI / 2)   // the addition of PI/2 is necessary to pin 0 radian to the 0 degree-angle
                 *                            // the -1 is necessary to draw the arc not clock-wise
                 */
                var arc = d3.svg.arc() //
                    .innerRadius(inner) //
                    .outerRadius(outer) //
                    .startAngle(-start + (Math.PI / 2)) //
                    .endAngle(-end + (Math.PI / 2));

                group.append("path") //
                    .attr("id", quadrantIndex + "_" + arcIndex)
                    .attr("d", arc) //
                    .attr("fill", background ) //
                    .attr("fill-opacity", 1 / (outer / 100)) //
                    .attr("stroke", "grey") //
                    .attr("stroke-opacity", 0.4) //
                    .attr("stroke-width", 1);
            }

            function drawQuadrantLegend(group, quadrant, quadrantIndex, maxArcIndex, arcDistanceInPixel) {
                var transpile = (quadrant.upperAngle - quadrant.lowerAngle) / 90;
                var text = group.append('text')
                    .attr("class", "quadrantLegend")
                    .attr("dy", +20) //
                    .attr("dx", transpile * (maxArcIndex * arcDistanceInPixel));

                text.append("textPath")
                    .text(quadrant.title)
                    .attr("stroke", quadrant.color)
                    .attr("text-anchor", "middle")
                    .attr("xlink:href", "#" + quadrantIndex + "_" + maxArcIndex);

            }

            function drawArcLegend(canvas, radar_arcs) {
                // draw a legend for every configured radar_arcs
                _.forEach(radar_arcs, function (element, index) {
                    canvas.append("text") // Add a text element
                        .attr("y", center.y - 2) //
                        .attr("x", center.x + (radius * (index) + 5)) //
                        .attr('class', 'arcLegend') //
                        .text(element.title);
                });
            }

            function drawline(canvas, from, to, clazz) {
                canvas.append('line')
                    .attr("x1", from.x).attr("y1", from.y)
                    .attr("x2", to.x).attr("y2", to.y)
                    .attr("stroke", "black")
                    .attr("class", clazz)
                    .attr("stroke-opacity", 1) //
                    .attr("stroke-width", 1);
            }


            function hasSpotMoved(spot) {
                var result = false;
                if (_.size(spot.placements) > 1) {
                    var orderedPlacements = orderedHistoryOfPlacementsFor(spot);
                    result = not(_.isEqual(orderedPlacements[0], orderedPlacements[1]));
                }
                return result;
            }

            function orderedHistoryOfPlacementsFor(spot) {
                return _.sortByOrder(spot.placements, 'since', false);
            }

            function currentPlacementOf(spot) {
                return _.first(orderedHistoryOfPlacementsFor(spot));
            }

            function distanceBetweenPlacements(placementOne, placementTwo) {
                var pointOne = polar_to_cartesian2(placementOne.coordinates.radius, placementOne.coordinates.angle);
                var pointTwo = polar_to_cartesian2(placementTwo.coordinates.radius, placementTwo.coordinates.angle);

                var deltaX = Math.abs(pointOne.x - pointTwo.x);
                var deltaY = Math.abs(pointOne.y - pointTwo.y);

                return Math.sqrt(Math.pow(deltaX, 2) + Math.pow(deltaY, 2));
            }

            function polar_to_cartesian2(r, t) {
                //radians to degrees, requires the t*pi/180
                var x = r * Math.cos((t * Math.PI / 180));
                var y = r * Math.sin((-t * Math.PI / 180));
                return {"x": x, "y": y};
            }

            function radiusOf(placement) {
                return placement.coordinates.radius;
            }

            function angleOf(placement) {
                return placement.coordinates.angle;
            }

            function not(booleanValue) {
                return !booleanValue;
            }
        }
    };
})(this);
