export type HousingType = "cottage" | "hotel";

export interface Building {
    name: string;
    capacity: number;
    housingType: HousingType;
}

export interface BuildingGroup {
    name: string;
    priority: number;
    buildings: Building[];
}

export interface Family {
    name: string;
    size: number;
    requiredHousingType?: HousingType;
}

export interface FamilyGroup {
    name: string;
    priority: number;
    size: number;
    families: Family[];
}

export interface FamilyRequestingBuilding extends Family {
    requestedBuildingName: string;
}

export interface Assignment {
    familyName: string;
    familySize: number;
    familyGroup: string;
    buildingName: string;
    buildingGroup: string;
}

export interface BuildingResult {
    name: string;
    priority: number;
    capacity: number;
    capacityFilled: number;
}

export interface Result {
    assignments: Assignment[];
    noMatches: Family[];
    buildingResults: BuildingResult[];
}

interface AssignedFamily extends Family {
    familyGroupName?: string;
}

interface AssignableBuilding extends Building {
    capacityFilled: number;
    assignedTo: AssignedFamily[];
}

interface AssignableBuildingGroup {
    name: string;
    priority: number;
    assignableBuildings: AssignableBuilding[];
}

export function packBuildings(
    buildingGroups: BuildingGroup[],
    familyGroups: FamilyGroup[],
    assignedFamilies: FamilyRequestingBuilding[]
): Result {
    // Prepare assignable buildings array
    // Sort building groups by priority
    const assignableBuildingGroups: AssignableBuildingGroup[] = buildingGroups.map(
        ({ name, priority, buildings }) => ({
            name,
            priority,
            assignableBuildings: buildings.map(building => ({
                ...building,
                capacityFilled: 0,
                assignedTo: []
            }))
        })
    );
    assignableBuildingGroups.sort((a, b) => {
        return +(b.priority < a.priority) - +(a.priority < b.priority);
    });

    // Sort family groups by priority and families by size
    familyGroups.sort((a, b) => {
        return +(b.priority < a.priority) - +(a.priority < b.priority);
    });
    familyGroups.forEach(familyGroup => {
        familyGroup.families.sort((a, b) => {
            return +(b.size > a.size) - +(a.size > b.size);
        });
    });

    const noMatches: Family[] = [];

    // Try to put each assignedFamily into their requested building
    if (assignedFamilies.length) {
        const assignableBuildingMap = new Map<string, AssignableBuilding>();
        assignableBuildingGroups.forEach(assignableBuildingGroup => {
            assignableBuildingGroup.assignableBuildings.forEach(
                assignableBuilding => {
                    assignableBuildingMap.set(
                        assignableBuilding.name.toLowerCase(),
                        assignableBuilding
                    );
                }
            );
        });

        let familyGroupPriority = 1000;
        const appendFamilyGroup = (
            family: Family,
            requiredHousingType?: HousingType
        ) => {
            familyGroups.push({
                name: "",
                priority: familyGroupPriority++,
                size: family.size,
                families: [
                    {
                        ...family,
                        requiredHousingType:
                            family.requiredHousingType || requiredHousingType
                    }
                ]
            });
        };

        assignedFamilies.forEach(assignedFamily => {
            const requestedBuilding = assignableBuildingMap.get(
                assignedFamily.requestedBuildingName.toLowerCase()
            );
            if (!requestedBuilding) {
                console.log(
                    `[WARN] Could not assign family '${
                        assignedFamily.name
                    }' to requested building '${
                        assignedFamily.requestedBuildingName
                    }' because the building does not exist.`
                );
                appendFamilyGroup(assignedFamily);
                return;
            }

            if (tryAssignFamilyToBuilding(assignedFamily, requestedBuilding)) {
                console.log(
                    `Assigned family '${
                        assignedFamily.name
                    }' to requested building '${requestedBuilding.name}'`
                );
            } else {
                console.log(
                    `[WARN] Could not assign family '${
                        assignedFamily.name
                    }' to requested building '${
                        assignedFamily.requestedBuildingName
                    }' because the building is full.`
                );
                appendFamilyGroup(
                    assignedFamily,
                    requestedBuilding.housingType
                ); // pass the requested building housing type, in case the assignedFamily doesn't have the requiredHousingType prop
            }
        });
    }

    // Iterate through each family group and try to match them to a building group
    familyGroups.forEach(familyGroup => {
        const familyGroupSize = familyGroup.size;
        let familyGroupAssigned = false;
        for (let i = 0; i < assignableBuildingGroups.length; i++) {
            const assignableBuildingGroup = assignableBuildingGroups[i];

            if (
                getAssignableBuildingGroupCapacity(assignableBuildingGroup) >=
                familyGroupSize
            ) {
                // Family group will fit in building group, try to assign all families to buildings
                const assignableBuildingsWorkingSet = assignableBuildingGroup.assignableBuildings.map(
                    ab => ({
                        ...ab
                    })
                );
                const allFamiliesFitInBuildings = familyGroup.families.every(
                    family => {
                        return assignableBuildingsWorkingSet.some(
                            assignableBuilding =>
                                tryAssignFamilyToBuilding(
                                    {
                                        ...family,
                                        familyGroupName: familyGroup.name
                                    },
                                    assignableBuilding
                                )
                        );
                    }
                );

                if (allFamiliesFitInBuildings) {
                    assignableBuildingGroup.assignableBuildings = assignableBuildingsWorkingSet;
                    familyGroupAssigned = true;
                    break;
                }
            }
        }

        if (!familyGroupAssigned) {
            noMatches.push(...familyGroup.families);
        }
    });

    const assignments: Assignment[] = [];
    const buildingResults: BuildingResult[] = [];
    assignableBuildingGroups.forEach(assignableBuildingGroup => {
        assignableBuildingGroup.assignableBuildings.forEach(
            assignableBuilding => {
                buildingResults.push({
                    name: assignableBuilding.name,
                    priority: assignableBuildingGroup.priority,
                    capacity: assignableBuilding.capacity,
                    capacityFilled: assignableBuilding.capacityFilled
                });

                assignableBuilding.assignedTo.forEach(family => {
                    assignments.push({
                        buildingGroup: assignableBuildingGroup.name,
                        buildingName: assignableBuilding.name,
                        familyGroup: family.familyGroupName || "",
                        familyName: family.name,
                        familySize: family.size
                    });
                });
            }
        );
    });

    return {
        assignments,
        noMatches,
        buildingResults
    };
}

function tryAssignFamilyToBuilding(
    family: AssignedFamily,
    building: AssignableBuilding
): boolean {
    const remainingCapacity = building.capacity - building.capacityFilled;
    if (
        family.size > remainingCapacity ||
        (family.requiredHousingType &&
            family.requiredHousingType !== building.housingType)
    ) {
        return false;
    }

    building.capacityFilled = building.capacityFilled + family.size;
    building.assignedTo.push(family);
    return true;
}

function getAssignableBuildingGroupCapacity(
    assignableBuildingGroup: AssignableBuildingGroup
): number {
    return assignableBuildingGroup.assignableBuildings.reduce(
        (prev, cur) => prev + (cur.capacity - cur.capacityFilled),
        0
    );
}
